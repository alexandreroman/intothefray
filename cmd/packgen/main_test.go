package main

import (
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/packgen/report"
)

func TestPrintFallback(t *testing.T) {
	entries := []report.Fallback{
		{Source: "mc4db", Pack: "fne", Code: "60065", Name: "A"},
		{Source: "mc4db", Pack: "fne", Code: "60066", Name: "B"},
		{Source: "mc4db", Pack: "thor", Code: "06099", Name: "C"},
	}

	var out strings.Builder
	printFallback(&out, entries)

	want := "from mc4db (fne): 2 records: 60065, 60066\nfrom mc4db (thor): 1 records: 06099\n"
	if got := out.String(); got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}
