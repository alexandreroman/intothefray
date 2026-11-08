// Package packstest holds test helpers for the code that reads the embedded
// card packs.
package packstest

import (
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/packs"
)

// Catalog returns the catalog of the embedded packs (see packs.Catalog),
// failing the test when they cannot be decoded. It is shared and read-only.
func Catalog(t testing.TB) *pack.Catalog {
	t.Helper()
	cat, err := packs.Catalog()
	if err != nil {
		t.Fatalf("decode the embedded packs: %v", err)
	}
	return cat
}
