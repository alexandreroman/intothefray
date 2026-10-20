// Command packgen regenerates the card-pack files from marvelcdb, completed
// with the official mc4db cards it lacks, and Cerebro, with the French names of
// fr.marvelcdb and the French images of mc4db.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"strings"

	"github.com/alexandreroman/intothefray/internal/packgen/build"
	"github.com/alexandreroman/intothefray/internal/packgen/cerebro"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
	"github.com/alexandreroman/intothefray/internal/packgen/images"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/mc4db"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
	"github.com/alexandreroman/intothefray/internal/packgen/write"
)

// userAgent identifies the generator to the source and image hosts, which may
// throttle anonymous clients.
const userAgent = "intothefray-packgen (+https://github.com/alexandreroman/intothefray)"

type options struct {
	out        string
	cache      string
	curatedDir string
	refresh    bool
	lang       string
}

func main() {
	os.Exit(execute())
}

// execute returns the exit status, so deferred cleanups run before exiting.
func execute() int {
	var opts options
	flag.StringVar(&opts.out, "out", "packs/dist", "output root")
	flag.StringVar(&opts.cache, "cache", "packs/.cache", "source and image-check cache")
	flag.StringVar(&opts.curatedDir, "curated", "packs/curated", "curated files")
	flag.BoolVar(&opts.refresh, "refresh", false, "ignore cached source data")
	flag.StringVar(&opts.lang, "lang", "en", "language")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	if err := run(ctx, logger, opts); err != nil {
		logger.Error("packgen failed", "error", err)
		return 1
	}
	return 0
}

func run(ctx context.Context, logger *slog.Logger, opts options) error {
	logger.Info("fetching sources")
	inputs, err := fetchInputs(ctx, opts)
	if err != nil {
		return err
	}

	urls := build.ImageURLs(inputs)
	logger.Info("checking images", "urls", len(urls))
	checker := &images.Checker{CachePath: filepath.Join(opts.cache, "images.json"), UserAgent: userAgent}
	// Nothing is written when some checks stay inconclusive: dropping their
	// cards would silently shrink the packs.
	inputs.Alive, err = checker.Check(ctx, urls)
	if err != nil {
		if errors.Is(err, images.ErrInconclusive) {
			return fmt.Errorf("image checks incomplete, rerun later: %w", err)
		}
		return fmt.Errorf("check images: %w", err)
	}

	result, err := build.Build(inputs)
	if err != nil {
		return fmt.Errorf("build packs: %w", err)
	}
	if err := write.Dist(opts.out, opts.lang, result); err != nil {
		return fmt.Errorf("write packs: %w", err)
	}
	logger.Info("packs written", "dir", filepath.Join(opts.out, opts.lang))

	printReport(os.Stdout, result)
	return nil
}

func fetchInputs(ctx context.Context, opts options) (build.Inputs, error) {
	client := &fetch.Client{CacheDir: opts.cache, Refresh: opts.refresh, UserAgent: userAgent}

	var in build.Inputs
	var err error
	if in.MC, err = marvelcdb.FetchCards(ctx, client, marvelcdb.BaseURL); err != nil {
		return in, err
	}
	if in.MCPacks, err = marvelcdb.FetchPacks(ctx, client, marvelcdb.BaseURL); err != nil {
		return in, err
	}
	if in.FrenchMC, err = marvelcdb.FetchCards(ctx, client, marvelcdb.FrenchBaseURL); err != nil {
		return in, err
	}
	if in.FrenchMCPacks, err = marvelcdb.FetchPacks(ctx, client, marvelcdb.FrenchBaseURL); err != nil {
		return in, err
	}
	if in.MC4DB, err = mc4db.FetchCards(ctx, client); err != nil {
		return in, err
	}
	if in.MC4DBPacks, err = mc4db.FetchPacks(ctx, client); err != nil {
		return in, err
	}
	if in.CB, err = cerebro.FetchCards(ctx, client); err != nil {
		return in, err
	}
	if in.CBSets, err = cerebro.FetchSets(ctx, client); err != nil {
		return in, err
	}
	if in.Curated, err = curated.Load(opts.curatedDir); err != nil {
		return in, err
	}
	return in, nil
}

func printReport(w io.Writer, result build.Result) {
	var cards, supported int
	for _, packFile := range result.Packs {
		cards += len(packFile.Cards)
	}
	for _, scenario := range result.Index.Scenarios {
		if scenario.Supported {
			supported++
		}
	}

	_, _ = fmt.Fprintf(w, "packs: %d\n", len(result.Packs))
	_, _ = fmt.Fprintf(w, "cards: %d\n", cards)
	_, _ = fmt.Fprintf(w, "scenarios supported: %d\n", supported)
	_, _ = fmt.Fprintf(w, "scenarios unsupported: %d\n", len(result.Index.Scenarios)-supported)
	for _, scenario := range result.Index.Scenarios {
		if !scenario.Supported {
			_, _ = fmt.Fprintf(w, "unsupported scenario %s (%s)\n", scenario.ID, scenario.Pack)
		}
	}
	printFallback(w, result.Fallback)
	for _, coverage := range result.Coverage {
		_, _ = fmt.Fprintln(w, coverage)
		if len(coverage.PacksWithoutImages) > 0 {
			_, _ = fmt.Fprintf(w, "%s: no image in packs %s\n", coverage.Lang, strings.Join(coverage.PacksWithoutImages, ", "))
		}
	}
	for _, entry := range result.Report {
		_, _ = fmt.Fprintf(w, "unsupported %s %q (%s): %s\n", entry.Code, entry.Name, entry.Pack, entry.Reason)
	}
}

// printFallback prints one line per source and pack with the records taken
// from that source, e.g. "from mc4db (fne): 2 records: 60065, 60066". The
// entries are sorted by source, pack and code.
func printFallback(w io.Writer, entries []report.Fallback) {
	for len(entries) > 0 {
		first := entries[0]
		var codes []string
		for _, entry := range entries {
			if entry.Source != first.Source || entry.Pack != first.Pack {
				break
			}
			codes = append(codes, entry.Code)
		}
		noun := "records"
		if len(codes) == 1 {
			noun = "record"
		}
		_, _ = fmt.Fprintf(w, "from %s (%s): %d %s: %s\n",
			first.Source, first.Pack, len(codes), noun, strings.Join(codes, ", "))
		entries = entries[len(codes):]
	}
}
