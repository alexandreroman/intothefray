// Command packgen regenerates the card-pack files from marvelcdb, completed
// with the official mc4db cards it lacks, and Cerebro, with the French names of
// mc4db, fr.marvelcdb and cgbuilder. The card images come from the image
// manifest of the image CDN.
//
// With -sources-only, it writes instead the image sources of every face, which
// the intothefray-img pipeline turns into that manifest.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"strings"

	"github.com/alexandreroman/intothefray/internal/packgen/build"
	"github.com/alexandreroman/intothefray/internal/packgen/cdn"
	"github.com/alexandreroman/intothefray/internal/packgen/cerebro"
	"github.com/alexandreroman/intothefray/internal/packgen/cgbuilder"
	"github.com/alexandreroman/intothefray/internal/packgen/curated"
	"github.com/alexandreroman/intothefray/internal/packgen/fetch"
	"github.com/alexandreroman/intothefray/internal/packgen/marvelcdb"
	"github.com/alexandreroman/intothefray/internal/packgen/mc4db"
	"github.com/alexandreroman/intothefray/internal/packgen/report"
	"github.com/alexandreroman/intothefray/internal/packgen/write"
)

// userAgent identifies the generator to the source hosts, which may throttle
// anonymous clients.
const userAgent = "intothefray-packgen (+https://github.com/alexandreroman/intothefray)"

// lang is the language of the generated packs; the other languages are
// overrides inside them.
const lang = "en"

// manifestLangs are the languages the manifest coverage is reported for.
var manifestLangs = []string{"en", "fr"}

type options struct {
	out         string
	cache       string
	curatedDir  string
	sources     string
	manifest    string
	refresh     bool
	sourcesOnly bool
}

// inputsFunc gathers the source data of the packs, logging to logger. Tests
// replace the network fetch with fixtures.
type inputsFunc func(ctx context.Context, logger *slog.Logger, opts options) (build.Inputs, error)

func main() {
	os.Exit(execute())
}

// execute returns the exit status, so deferred cleanups run before exiting.
func execute() int {
	var opts options
	flag.StringVar(&opts.out, "out", "packs/dist", "output root")
	flag.StringVar(&opts.cache, "cache", "packs/.cache", "source data cache")
	flag.StringVar(&opts.curatedDir, "curated", "packs/curated", "curated files")
	flag.StringVar(&opts.sources, "sources", "packs/images/sources.json", "image sources written by -sources-only")
	flag.StringVar(&opts.manifest, "manifest", "packs/images/manifest.json", "image manifest written by intothefray-img")
	flag.BoolVar(&opts.refresh, "refresh", false, "ignore cached source data")
	flag.BoolVar(&opts.sourcesOnly, "sources-only", false, "write the image sources only, not the packs")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	if err := run(ctx, logger, os.Stdout, opts, fetchInputs); err != nil {
		logger.Error("packgen failed", "error", err)
		return 1
	}
	return 0
}

func run(ctx context.Context, logger *slog.Logger, stdout io.Writer, opts options, inputs inputsFunc) error {
	if opts.sourcesOnly {
		return writeSources(ctx, logger, opts, inputs)
	}
	return writePacks(ctx, logger, stdout, opts, inputs)
}

// writeSources writes the image sources of every face, and leaves the packs as
// they are.
func writeSources(ctx context.Context, logger *slog.Logger, opts options, inputs inputsFunc) error {
	logger.Info("fetching sources")
	in, err := inputs(ctx, logger, opts)
	if err != nil {
		return err
	}
	faces, err := build.Sources(in)
	if err != nil {
		return fmt.Errorf("list image sources: %w", err)
	}
	if err := cdn.WriteSources(opts.sources, faces); err != nil {
		return err
	}
	logger.Info("image sources written", "path", opts.sources, "faces", len(faces))
	return nil
}

// writePacks builds the packs with the images of the manifest and writes them.
func writePacks(ctx context.Context, logger *slog.Logger, stdout io.Writer, opts options, inputs inputsFunc) error {
	// Loaded before the slow fetch, so a missing manifest fails at once. Building
	// without one would drop every card for lack of an image.
	manifest, err := cdn.LoadManifest(opts.manifest)
	if errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("no image manifest, run make publish in intothefray-img first: %w", err)
	}
	if err != nil {
		return err
	}

	logger.Info("fetching sources")
	in, err := inputs(ctx, logger, opts)
	if err != nil {
		return err
	}
	in.Manifest = manifest

	result, err := build.Build(in)
	if err != nil {
		return fmt.Errorf("build packs: %w", err)
	}
	faces, err := build.Sources(in)
	if err != nil {
		return fmt.Errorf("list image sources: %w", err)
	}
	if err := write.Dist(opts.out, lang, result); err != nil {
		return fmt.Errorf("write packs: %w", err)
	}
	logger.Info("packs written", "dir", filepath.Join(opts.out, lang))

	printReport(stdout, result)
	printManifestCoverage(stdout, manifest, faces)
	return nil
}

func fetchInputs(ctx context.Context, logger *slog.Logger, opts options) (build.Inputs, error) {
	client := &fetch.Client{CacheDir: opts.cache, Refresh: opts.refresh, UserAgent: userAgent}
	return fetchInputsWith(ctx, logger, client, opts)
}

// fetchInputsWith gathers the source data with client. The French data only
// localizes the packs, so -sources-only does not fetch it.
func fetchInputsWith(ctx context.Context, logger *slog.Logger, client *fetch.Client, opts options) (build.Inputs, error) {
	var in build.Inputs
	var err error
	if in.MC, err = marvelcdb.FetchCards(ctx, client, marvelcdb.BaseURL); err != nil {
		return in, err
	}
	if in.MCPacks, err = marvelcdb.FetchPacks(ctx, client, marvelcdb.BaseURL); err != nil {
		return in, err
	}
	if !opts.sourcesOnly {
		if err := fetchFrenchInputs(ctx, logger, client, &in); err != nil {
			return in, err
		}
	}
	if in.MC4DB, err = mc4db.FetchCards(ctx, client, mc4db.BaseURL); err != nil {
		return in, err
	}
	if in.MC4DBPacks, err = mc4db.FetchPacks(ctx, client, mc4db.BaseURL); err != nil {
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

// fetchFrenchInputs adds the French names of fr.marvelcdb, mc4db and cgbuilder
// to in. cgbuilder only fills the gaps the other sources leave, from parsed
// HTML pages, so a cgbuilder failure is logged as a warning and the packs are
// built without its names; a failure of any other source fails.
func fetchFrenchInputs(ctx context.Context, logger *slog.Logger, client *fetch.Client, in *build.Inputs) error {
	var err error
	if in.FrenchMC, err = marvelcdb.FetchCards(ctx, client, marvelcdb.FrenchBaseURL); err != nil {
		return err
	}
	if in.FrenchMCPacks, err = marvelcdb.FetchPacks(ctx, client, marvelcdb.FrenchBaseURL); err != nil {
		return err
	}
	if in.FrenchMC4DB, err = mc4db.FetchFrenchCards(ctx, client, mc4db.BaseURL); err != nil {
		return err
	}
	if in.FrenchMC4DBPacks, err = mc4db.FetchFrenchPacks(ctx, client, mc4db.BaseURL); err != nil {
		return err
	}
	if in.FrenchMC4DBSets, err = mc4db.FetchFrenchSets(ctx, client, mc4db.BaseURL); err != nil {
		return err
	}
	site, err := cgbuilder.Fetch(ctx, client, cgbuilder.BaseURL)
	if ctx.Err() != nil {
		// Interrupted: stop rather than go on without cgbuilder.
		return ctx.Err()
	}
	if err != nil {
		logger.Warn("cgbuilder names left out", "error", err)
		return nil
	}
	in.CGBuilder = site
	return nil
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
	}
	for _, entry := range result.Report {
		_, _ = fmt.Fprintf(w, "unsupported %s %q (%s): %s\n", entry.Code, entry.Name, entry.Pack, entry.Reason)
	}
}

// printManifestCoverage prints, per language, how many of the faces the
// manifest has an image for, e.g. "manifest fr: 4100/4198 faces". A face
// without an English image drops its card, so a low English count shows a
// partial manifest.
func printManifestCoverage(w io.Writer, manifest cdn.Manifest, faces []cdn.SourceFace) {
	for _, manifestLang := range manifestLangs {
		covered := 0
		for _, face := range faces {
			if _, found := manifest.Image(face.Code, manifestLang); found {
				covered++
			}
		}
		_, _ = fmt.Fprintf(w, "manifest %s: %d/%d faces\n", manifestLang, covered, len(faces))
	}
}

// printFallback prints one line per pack with the records taken from mc4db,
// e.g. "from mc4db (fne): 2 records: 60065, 60066". The entries are sorted by
// pack and code.
func printFallback(w io.Writer, entries []report.Fallback) {
	for len(entries) > 0 {
		first := entries[0]
		var codes []string
		for _, entry := range entries {
			if entry.Pack != first.Pack {
				break
			}
			codes = append(codes, entry.Code)
		}
		noun := "records"
		if len(codes) == 1 {
			noun = "record"
		}
		_, _ = fmt.Fprintf(w, "from mc4db (%s): %d %s: %s\n", first.Pack, len(codes), noun, strings.Join(codes, ", "))
		entries = entries[len(codes):]
	}
}
