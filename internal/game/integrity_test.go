package game

import (
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"slices"
	"strconv"
	"testing"
)

// checkIntegrity verifies that every card of the table is in exactly one
// place (table, hand, pile or stage zone) and that every card id referenced by
// stages, piles, hands, parents, arrows and views exists.
func checkIntegrity(t *testing.T, table *Table) {
	t.Helper()

	// Where each id is listed: "pile:<id>", "hand:<area>" or "stage:<key>".
	listed := map[string][]string{}
	for id, pile := range table.Piles {
		for _, card := range pile.Cards {
			listed[card] = append(listed[card], "pile:"+id)
		}
	}
	for area, hand := range table.Hands {
		for _, card := range hand {
			listed[card] = append(listed[card], "hand:"+string(area))
		}
	}
	for _, stage := range table.Stages {
		for _, card := range stage.Cards {
			if card != stage.Current {
				listed[card] = append(listed[card], "stage:"+stage.Key)
			}
		}
	}

	for id := range listed {
		if _, ok := table.Cards[id]; !ok {
			t.Errorf("card %s is listed in %v but does not exist", id, listed[id])
		}
	}
	for id, c := range table.Cards {
		if c.ID != id {
			t.Errorf("card stored under %s has id %s", id, c.ID)
		}
		places := listed[id]
		var want []string
		switch c.Zone {
		case ZoneTable:
		case ZoneHand:
			want = []string{"hand:" + string(c.Area)}
		case ZonePile:
			want = []string{"pile:" + c.Pile}
		case ZoneStage:
			want = []string{"stage:" + stageKeyOf(table, id)}
		default:
			t.Errorf("card %s is in unknown zone %q", id, c.Zone)
		}
		if !slices.Equal(places, want) {
			t.Errorf("card %s in zone %q is listed in %v, want %v", id, c.Zone, places, want)
		}
		if c.Parent != "" {
			parent, ok := table.Cards[c.Parent]
			if !ok || parent.Zone != ZoneTable || c.Zone != ZoneTable {
				t.Errorf("card %s is tucked under %s, which is not a table card beside it", id, c.Parent)
			}
		}
	}

	for _, stage := range table.Stages {
		current, ok := table.Cards[stage.Current]
		if !ok || current.Zone != ZoneTable || !slices.Contains(stage.Cards, stage.Current) {
			t.Errorf("stage %s shows %s, which is not one of its cards on the table", stage.Key, stage.Current)
		}
	}
	for _, arrow := range table.Arrows {
		for _, id := range []string{arrow.From, arrow.To} {
			if c, ok := table.Cards[id]; !ok || c.Zone != ZoneTable {
				t.Errorf("arrow %+v points at %s, which is not on the table", arrow, id)
			}
		}
	}
	for area, view := range table.Views {
		for _, id := range view.Cards {
			if _, ok := table.Cards[id]; !ok {
				t.Errorf("view of %s lists unknown card %s", area, id)
			}
		}
	}
}

// stageKeyOf returns the key of the stage listing card id, or "".
func stageKeyOf(table *Table, id string) string {
	for _, stage := range table.Stages {
		if slices.Contains(stage.Cards, id) {
			return stage.Key
		}
	}
	return ""
}

func TestIntegrityAfterSetup(t *testing.T) {
	checkIntegrity(t, startedGame(t, rhinoConfig()).Table)
}

func TestIntegrityAfterActions(t *testing.T) {
	f := newDoFixture(t)
	scheme := f.g.Table.stage(pileKeyScheme)
	villain := f.g.Table.stage(pileKeyVillain)
	identity := f.identity(t)

	f.mustDo(t, "h", Action{Kind: ActDraw, N: 3}, at(1))
	f.mustDo(t, "b", Action{Kind: ActDraw, N: 2}, at(2))
	played := f.g.Table.Hands["p0"][0]
	f.mustDo(t, "h", Action{Kind: ActPlay, Card: played, Area: "p0", X: 400, Y: 200}, at(3))
	f.mustDo(t, "h", Action{Kind: ActAttach, Card: played, Target: identity}, at(4))
	f.mustDo(t, "b", Action{Kind: ActReveal}, at(5))
	revealed := f.g.Table.revealed()[0].ID
	f.mustDo(t, "b", Action{Kind: ActArrowAdd, Card: revealed, Target: identity}, at(6))
	f.mustDo(t, "h", Action{Kind: ActChooseStage, Stage: villain.Key, Card: villain.Cards[1]}, at(7))
	f.mustDo(t, "h", Action{Kind: ActFlip, Card: scheme.Current}, at(8))
	f.mustDo(t, "b", Action{Kind: ActDeal, Area: "p1", X: 400, Y: 200}, at(9))
	f.mustDo(t, "h", Action{Kind: ActDiscard, Card: identity}, at(10))
	f.mustDo(t, "b", Action{Kind: ActDiscardTop, Pile: PileEncounter, N: 2}, at(11))
	f.mustDo(t, "b", Action{Kind: ActShuffleBack, Pile: PileEncounterDiscard}, at(12))
	f.mustDo(t, "h", Action{Kind: ActSearch, Pile: "deck:p0"}, at(13))
	f.mustDo(t, "h", Action{Kind: ActCloseView, Where: whereShuffle}, at(14))
	checkIntegrity(t, f.g.Table)

	checkSnapshots(t, f.g)

	for range 3 {
		f.mustDo(t, "h", Action{Kind: ActUndo}, at(20))
		checkIntegrity(t, f.g.Table)
		checkSnapshots(t, f.g)
	}
	f.mustDo(t, "b", Action{Kind: ActUndo}, at(21))
	checkIntegrity(t, f.g.Table)
	checkSnapshots(t, f.g)
}

func TestGameJSONRoundTrip(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	f.mustDo(t, "b", Action{Kind: ActDraw, N: 2}, at(2))
	f.mustDo(t, "b", Action{Kind: ActSearch, Pile: PileEncounter}, at(3))
	f.mustDo(t, "h", Action{Kind: ActArrowAdd, Card: f.villain(), Target: f.identity(t)}, at(4))

	data := mustJSON(t, f.g)
	decoded := &Game{}
	if err := json.Unmarshal([]byte(data), decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if again := mustJSON(t, decoded); again != data {
		t.Errorf("marshal after a round trip differs:\nfirst  %s\nsecond %s", data, again)
	}

	f.g = decoded
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(5))
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(6))
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(7))
	if f.g.Table.Cards[f.villain()].Exhausted {
		t.Error("the decoded game did not undo the exhaust")
	}
	if got := len(f.g.Table.Hands["p0"]); got != 0 {
		t.Errorf("p0 holds %d cards after undoing the draw, want 0", got)
	}
	checkIntegrity(t, f.g.Table)
}

// doOnlyKinds are handled by Do itself and never reach resolve.
var doOnlyKinds = []Kind{ActLook, ActSearch, ActCloseView, ActUndo}

// TestEveryResolvableKindIsDescribedOrArranging reads the Kind constants and
// the cases of narrator.describe from the source, so that a new action kind
// cannot silently fall into the untracked default.
func TestEveryResolvableKindIsDescribedOrArranging(t *testing.T) {
	kinds := kindConstants(t, "action.go", "history.go")
	described := describedKinds(t, "narrate.go")
	if len(kinds) == 0 || len(described) == 0 {
		t.Fatalf("found %d kinds and %d described kinds", len(kinds), len(described))
	}

	for name, kind := range kinds {
		if slices.Contains(doOnlyKinds, kind) {
			continue
		}
		isDescribed, isArranging := described[name], arrangingKinds[kind]
		switch {
		case isDescribed && isArranging:
			t.Errorf("%s is both described and arranging", name)
		case !isDescribed && !isArranging:
			t.Errorf("%s is neither described nor arranging", name)
		}
	}
}

// kindConstants returns the constants of type Kind declared in files, by name.
func kindConstants(t *testing.T, files ...string) map[string]Kind {
	t.Helper()
	kinds := map[string]Kind{}
	for _, file := range files {
		parsed, err := parser.ParseFile(token.NewFileSet(), file, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(parsed, func(n ast.Node) bool {
			spec, ok := n.(*ast.ValueSpec)
			if !ok {
				return true
			}
			if ident, ok := spec.Type.(*ast.Ident); !ok || ident.Name != "Kind" {
				return true
			}
			for i, name := range spec.Names {
				value, err := strconv.Unquote(spec.Values[i].(*ast.BasicLit).Value)
				if err != nil {
					t.Fatal(err)
				}
				kinds[name.Name] = Kind(value)
			}
			return true
		})
	}
	return kinds
}

// describedKinds returns the names of the kinds listed in the cases of
// narrator.describe.
func describedKinds(t *testing.T, file string) map[string]bool {
	t.Helper()
	parsed, err := parser.ParseFile(token.NewFileSet(), file, nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, decl := range parsed.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Name.Name != "describe" {
			continue
		}
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			clause, ok := n.(*ast.CaseClause)
			if !ok {
				return true
			}
			for _, expr := range clause.List {
				if ident, ok := expr.(*ast.Ident); ok {
					names[ident.Name] = true
				}
			}
			return true
		})
	}
	return names
}
