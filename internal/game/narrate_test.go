package game

import (
	"slices"
	"strings"
	"testing"
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
		{"flip", Action{Kind: ActFlip, Card: f.identity(t)}, []string{"Peter Parker", "Spider-Man"}},
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
}

func TestStageNameFlagsOnlyTheCardName(t *testing.T) {
	f := newDoFixture(t)
	stage := f.g.Table.stage(pileKeyVillain)

	f.mustDo(t, "h", Action{Kind: ActChooseStage, Stage: stage.Key, Card: stage.Cards[1]}, at(1))

	want := []LogPart{
		{Text: "replaced the villain "},
		{Text: "Rhino", Card: true},
		{Text: " (stage I) with "},
		{Text: "Rhino", Card: true},
		{Text: " (stage II)"},
	}
	if got := f.lastLog().Parts; !slices.Equal(got, want) {
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
