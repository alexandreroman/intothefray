package game

import (
	"encoding/json"
	"reflect"
	"slices"
	"strings"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// cardNames returns the texts of the parts of entry flagged as card names.
func cardNames(entry LogEntry) []string {
	var names []string
	for _, part := range entry.Parts {
		if part.Card {
			names = append(names, part.Text)
		}
	}
	return names
}

// checkPartsSpellText fails when entry has parts that do not spell its text.
func checkPartsSpellText(t *testing.T, entry LogEntry) {
	t.Helper()
	if entry.Parts == nil {
		return
	}
	var joined strings.Builder
	for _, part := range entry.Parts {
		joined.WriteString(part.Text)
	}
	if joined.String() != entry.Text {
		t.Errorf("parts spell %q, text is %q", joined.String(), entry.Text)
	}
}

// cardRefs returns the face references of the card parts of entry, in order.
func cardRefs(entry LogEntry) []pack.FaceRef {
	var refs []pack.FaceRef
	for _, part := range entry.Parts {
		if part.Card && part.Ref != nil {
			refs = append(refs, *part.Ref)
		}
	}
	return refs
}

// checkPartRefs fails when a part of the log has a reference it should not
// have, or lacks one it should: every card part refers to a catalog face whose
// name is its text, and no plain part refers to anything.
func checkPartRefs(t *testing.T, cat *pack.Catalog, log []LogEntry) {
	t.Helper()
	for _, entry := range log {
		for _, part := range entry.Parts {
			if !part.Card {
				if part.Ref != nil {
					t.Errorf("line %q: plain part %q refers to %+v", entry.Text, part.Text, *part.Ref)
				}
				continue
			}
			if part.Ref == nil {
				t.Errorf("line %q: card part %q has no reference", entry.Text, part.Text)
				continue
			}
			def, _, err := cat.Card(part.Ref.Card)
			switch {
			case err != nil || def.Code != part.Ref.Card:
				t.Errorf("line %q: part %q refers to %q, not a canonical card code", entry.Text, part.Text, part.Ref.Card)
			case part.Ref.Face < 0 || part.Ref.Face >= len(def.Faces):
				t.Errorf("line %q: part %q refers to face %d of %s", entry.Text, part.Text, part.Ref.Face, def.Code)
			case def.Faces[part.Ref.Face].Name != part.Text:
				t.Errorf("line %q: part %q refers to face %q", entry.Text, part.Text, def.Faces[part.Ref.Face].Name)
			}
		}
	}
}

// faceRefOf returns the reference to the face card id shows.
func (f *doFixture) faceRefOf(t *testing.T, id string) pack.FaceRef {
	t.Helper()
	c := f.g.Table.Cards[id]
	def, _, err := f.cat.Card(c.Code)
	if err != nil {
		t.Fatal(err)
	}
	return pack.FaceRef{Card: def.Code, Face: c.Face}
}

func TestLinePartsFlagCardNames(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 2}, at(1))
	hand := f.g.Table.Hands["p0"]
	discarded, moved := hand[0], hand[1]

	tests := []struct {
		name   string
		action Action
		want   []string
	}{
		{"exhaust", Action{Kind: ActExhaust, Card: f.villain()}, []string{"Rhino"}},
		{"flip", Action{Kind: ActFlip, Card: identityOf(t, f.g, 0)}, []string{"Peter Parker", "Spider-Man"}},
		{"discard", Action{Kind: ActDiscard, Card: discarded}, []string{f.nameOf(t, discarded)}},
		{"move", Action{Kind: ActToPile, Card: moved, Target: PileVictory}, []string{f.nameOf(t, moved)}},
	}
	for i, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f.mustDo(t, "h", tt.action, at(10+20*i))
			line := f.lastLog()
			checkPartsSpellText(t, line)
			if got := cardNames(line); !slices.Equal(got, tt.want) {
				t.Errorf("line %q names cards %q, want %q", line.Text, got, tt.want)
			}
		})
	}
}

func TestHiddenCardIsNoCardPart(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
	card := f.g.Table.Hands["p0"][0]

	f.mustDo(t, "h", Action{Kind: ActToDeck, Card: card, Where: whereBottom}, at(2))

	line := f.lastLog()
	if got := cardNames(line); len(got) != 0 {
		t.Errorf("line %q names hidden cards %q", line.Text, got)
	}
	if line.Parts != nil {
		t.Errorf("line %q naming no card has parts %+v", line.Text, line.Parts)
	}
}

func TestPlayerNamesMakeNoCardPart(t *testing.T) {
	f := newDoFixture(t)
	f.g.Players[0].Name = "**Bob**"
	f.g.Players[1].Name = "<b>x</b>"

	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	exhausted := f.lastLog()
	f.mustDo(t, "h", Action{Kind: ActDeal, Area: "p1"}, at(2))
	dealt := f.lastLog()

	if got := cardNames(exhausted); exhausted.Who != "**Bob**" || !slices.Equal(got, []string{"Rhino"}) {
		t.Errorf("line by %q names cards %q, want [Rhino]", exhausted.Who, got)
	}
	if !strings.Contains(dealt.Text, "<b>x</b>") {
		t.Fatalf("line %q does not name the player dealt to", dealt.Text)
	}
	if dealt.Parts != nil {
		t.Errorf("line %q naming a player only has parts %+v", dealt.Text, dealt.Parts)
	}
	for _, entry := range f.g.Log {
		checkPartsSpellText(t, entry)
		for _, name := range cardNames(entry) {
			if strings.Contains(name, "Bob") || strings.Contains(name, "<b>") {
				t.Errorf("line %q flags a player name as a card: %q", entry.Text, name)
			}
		}
	}
}

func TestMergedLineKeepsCardParts(t *testing.T) {
	f := newDoFixture(t)
	plusOne := Action{Kind: ActToken, Card: f.villain(), Name: "dmg", Delta: 1}

	f.mustDo(t, "h", plusOne, at(0))
	f.mustDo(t, "h", plusOne, at(5))

	line := f.lastLog()
	if line.Text != "set damage on Rhino to 2" {
		t.Fatalf("merged line = %q, want a merged counter line", line.Text)
	}
	checkPartsSpellText(t, line)
	if got := cardNames(line); !slices.Equal(got, []string{"Rhino"}) {
		t.Errorf("merged line names cards %q, want [Rhino]", got)
	}
	if got, want := cardRefs(line), []pack.FaceRef{rhinoI}; !slices.Equal(got, want) {
		t.Errorf("merged line refers to %+v, want %+v", got, want)
	}
	checkPartRefs(t, f.cat, f.g.Log)
}

func TestUndoLineKeepsCardParts(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
	f.mustDo(t, "h", Action{Kind: ActUndo}, at(2))

	line := f.lastLog()
	if line.Text != "undid “exhausted Rhino”" {
		t.Fatalf("undo line = %q", line.Text)
	}
	checkPartsSpellText(t, line)
	if got := cardNames(line); !slices.Equal(got, []string{"Rhino"}) {
		t.Errorf("undo line names cards %q, want [Rhino]", got)
	}
	if got, want := cardRefs(line), []pack.FaceRef{rhinoI}; !slices.Equal(got, want) {
		t.Errorf("undo line refers to %+v, want %+v", got, want)
	}
	checkPartRefs(t, f.cat, f.g.Log)
}

func TestStageNameFlagsOnlyTheCardName(t *testing.T) {
	f := newDoFixture(t)
	stage := f.g.Table.stage(pileKeyVillain)

	f.mustDo(t, "h", Action{Kind: ActChooseStage, Stage: stage.Key, Card: stage.Cards[1]}, at(1))

	want := []LogPart{
		{Text: "replaced the villain "},
		{Text: "Rhino", Card: true, Ref: &rhinoI},
		{Text: " (stage I) with "},
		{Text: "Rhino", Card: true, Ref: &rhinoII},
		{Text: " (stage II)"},
	}
	if got := f.lastLog().Parts; !reflect.DeepEqual(got, want) {
		t.Errorf("parts = %+v, want %+v", got, want)
	}
}

func TestLogViewCarriesParts(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))

	views := f.g.logViews(nil)
	last := views[len(views)-1]
	if !slices.Equal(last.Parts, f.lastLog().Parts) || len(last.Parts) == 0 {
		t.Errorf("view parts = %+v, want %+v", last.Parts, f.lastLog().Parts)
	}
}

// Faces of the Rhino scenario that the history names.
var (
	rhinoI         = pack.FaceRef{Card: "01094", Face: 0}
	rhinoII        = pack.FaceRef{Card: "01095", Face: 0}
	spiderMan      = pack.FaceRef{Card: "01001", Face: 0}
	peterParker    = pack.FaceRef{Card: "01001", Face: 1}
	theBreakInOneA = pack.FaceRef{Card: "01097", Face: 0}
	theBreakInOneB = pack.FaceRef{Card: "01097", Face: 1}
)

func TestCardPartsReferToTheNamedFace(t *testing.T) {
	tests := []struct {
		name string
		// run performs the actions and returns the faces the last line names.
		run func(t *testing.T, f *doFixture) []pack.FaceRef
	}{
		{"card", func(t *testing.T, f *doFixture) []pack.FaceRef {
			f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))
			return []pack.FaceRef{rhinoI}
		}},
		{"hand card", func(t *testing.T, f *doFixture) []pack.FaceRef {
			f.mustDo(t, "h", Action{Kind: ActDraw, N: 1}, at(1))
			card := f.g.Table.Hands["p0"][0]
			f.mustDo(t, "h", Action{Kind: ActDiscard, Card: card}, at(2))
			return []pack.FaceRef{f.faceRefOf(t, card)}
		}},
		{"flip", func(t *testing.T, f *doFixture) []pack.FaceRef {
			f.mustDo(t, "h", Action{Kind: ActFlip, Card: identityOf(t, f.g, 0)}, at(1))
			return []pack.FaceRef{peterParker, spiderMan}
		}},
		{"flip the main scheme", func(t *testing.T, f *doFixture) []pack.FaceRef {
			f.mustDo(t, "h", Action{Kind: ActFlip, Card: f.g.Table.stage(pileKeyScheme).Current}, at(1))
			return []pack.FaceRef{theBreakInOneA, theBreakInOneB}
		}},
		{"replace the villain", func(t *testing.T, f *doFixture) []pack.FaceRef {
			stage := f.g.Table.stage(pileKeyVillain)
			f.mustDo(t, "h", Action{Kind: ActChooseStage, Stage: stage.Key, Card: stage.Cards[1]}, at(1))
			return []pack.FaceRef{rhinoI, rhinoII}
		}},
		{"turn the main scheme", func(t *testing.T, f *doFixture) []pack.FaceRef {
			stage := f.g.Table.stage(pileKeyScheme)
			f.mustDo(t, "h", Action{Kind: ActChooseStage, Stage: stage.Key, Card: stage.Current, Face: 1}, at(1))
			return []pack.FaceRef{theBreakInOneB}
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			f := newDoFixture(t)
			want := tt.run(t, f)
			line := f.lastLog()
			if got := cardRefs(line); !slices.Equal(got, want) {
				t.Errorf("line %q refers to %+v, want %+v", line.Text, got, want)
			}
			checkPartRefs(t, f.cat, f.g.Log)
		})
	}
}

func TestHiddenCardHasNoRef(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "b", Action{Kind: ActDeal, Area: "p1", X: 400, Y: 200}, at(1))
	dealt := f.lastDealt(t)
	f.mustDo(t, "b", Action{Kind: ActReveal}, at(2))
	revealed := f.g.Table.revealedOn(PileEncounter)[0].ID
	want := []pack.FaceRef{f.faceRefOf(t, revealed)}

	// The face-down card is "a card": a plain part, with no reference.
	f.mustDo(t, "b", groupOf(ActToDeck, whereBottom, "", dealt, revealed), at(10))

	line := f.lastLog()
	if !strings.Contains(line.Text, "("+hiddenCard+", ") {
		t.Fatalf("line %q names no hidden card", line.Text)
	}
	if got := cardRefs(line); !slices.Equal(got, want) {
		t.Errorf("line %q refers to %+v, want only the revealed card %+v", line.Text, got, want)
	}
	checkPartRefs(t, f.cat, f.g.Log)
}

func TestNonFaceNamesHaveNoRef(t *testing.T) {
	f := multiDeckFixture(t)
	f.mustDoAs(t, "a", 0, Action{Kind: ActDraw, N: 2}, at(1))

	// The setup line names the scenario and its sets, the draw a hero deck.
	for _, entry := range f.g.Log {
		if entry.Parts != nil {
			t.Errorf("line %q naming no face has parts %+v", entry.Text, entry.Parts)
		}
	}
	if got := f.g.Log[len(f.g.Log)-1].Text; !strings.Contains(got, "Spider-Man deck") {
		t.Errorf("draw line %q does not name the hero deck", got)
	}
}

func TestLogPartRefJSON(t *testing.T) {
	f := newDoFixture(t)
	f.mustDo(t, "h", Action{Kind: ActExhaust, Card: f.villain()}, at(1))

	data, err := json.Marshal(f.g.logViews(nil)[1].Parts)
	if err != nil {
		t.Fatal(err)
	}
	want := `[{"text":"exhausted "},{"text":"Rhino","card":true,"ref":{"card":"01094","face":0}}]`
	if string(data) != want {
		t.Errorf("parts JSON = %s, want %s", data, want)
	}
}
