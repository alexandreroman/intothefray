package main

import (
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

func TestPrintFallback(t *testing.T) {
	entries := []report.Fallback{
		{Pack: "fne", Code: "60065"},
		{Pack: "fne", Code: "60066"},
		{Pack: "thor", Code: "06099"},
	}

	var out strings.Builder
	printFallback(&out, entries)

	want := "from mc4db (fne): 2 records: 60065, 60066\nfrom mc4db (thor): 1 record: 06099\n"
	if got := out.String(); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}
