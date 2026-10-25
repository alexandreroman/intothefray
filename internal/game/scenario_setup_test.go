package game

import (
	"encoding/json"
	"errors"
	"maps"
	"slices"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// setupCatalog returns a small catalog: a classic scenario, a self-contained one with two villains whose decks and
// side schemes lie in the row, one whose encounter deck leaves a villain-set card over, and one with an ordered deck.
func setupCatalog(t *testing.T) *pack.Catalog {
	t.Helper()
	card := func(code, kind string, size pack.Size, qty int) pack.Card {
		return pack.Card{
			Code:     code,
			Faces:    []pack.Face{{Name: code, Type: kind, Size: size, Images: []string{code}}},
			Back:     pack.BackEncounter,
			Quantity: qty,
		}
	}
	hero := card("01001", "hero", pack.SizeStd, 1)
	hero.Aliases = []string{"01001a"}
	hero.Faces = append(hero.Faces, pack.Face{Name: "Alter", Type: "alter_ego", Size: pack.SizeStd, Images: []string{"x"}})

	file := pack.PackFile{
		Code: "t",
		Name: "Test",
		Cards: []pack.Card{
			hero,
			card("01090", "obligation", pack.SizeStd, 1),
			card("02001", "minion", pack.SizeStd, 1),
			// Villains and their side schemes.
			card("10001", "villain", pack.SizeStd, 1), card("10002", "villain", pack.SizeStd, 1),
			card("10003", "side_scheme", pack.SizeLand, 1),
			card("10004", "villain", pack.SizeStd, 1), card("10005", "villain", pack.SizeStd, 1),
			card("10006", "side_scheme", pack.SizeLand, 1),
			card("10010", "main_scheme", pack.SizeLand, 1),
			card("11001", "minion", pack.SizeStd, 2), card("11002", "minion", pack.SizeStd, 3),
			card("12001", "minion", pack.SizeStd, 1), card("12002", "minion", pack.SizeStd, 4),
			card("13001", "minion", pack.SizeStd, 1),
			// A classic scenario.
			card("20001", "villain", pack.SizeStd, 1), card("20002", "main_scheme", pack.SizeLand, 1),
			card("20003", "minion", pack.SizeStd, 2), card("20004", "environment", pack.SizeStd, 1),
		},
		Sets: []pack.Set{
			{Code: "hset", Name: "Hero", Kind: "hero", Cards: []string{"01001"}},
			{Code: "nem", Name: "Nemesis", Kind: "nemesis", Cards: []string{"02001"}},
			{Code: "sa", Name: "A", Kind: "villain", Cards: []string{"11001", "11002"}},
			{Code: "vs_c", Name: "Classic", Kind: "villain", Cards: []string{"20001", "20002", "20003", "20004"}},
			{
				Code: "vs_t", Name: "Twice", Kind: "villain",
				Cards: []string{"10001", "10002", "10003", "10004", "10005", "10006", "10010"},
			},
			{Code: "vs_l", Name: "Leftover", Kind: "villain", Cards: []string{"10001", "10002", "13001"}},
			{Code: "vs_o", Name: "Ordered", Kind: "villain", Cards: []string{"10001", "10002"}},
		},
		Heroes: []pack.Hero{{Identity: "01001", Set: "hset", Obligation: "01090", Nemesis: "nem"}},
		Scenarios: []pack.Scenario{
			{
				ID: "classic", VillainSet: "vs_c",
				Piles: []pack.Pile{
					{Key: "villain", Label: "Villain", Cards: []string{"20001"}},
					{Key: "scheme", Label: "Scheme", Cards: []string{"20002"}},
				},
				Start: map[pack.Difficulty]pack.Start{pack.Standard: {
					Top:    map[string]pack.FaceRef{"villain": {Card: "20001"}, "scheme": {Card: "20002"}},
					InPlay: []pack.FaceRef{{Card: "20004"}},
				}},
			},
			{
				ID: "twice", VillainSet: "vs_t", SelfContained: true, Active: "v1",
				Piles: []pack.Pile{
					{Key: "v1", Label: "One", Cards: []string{"10001", "10002"}, Deck: "da"},
					{Key: "v2", Label: "Two", Cards: []string{"10004", "10005"}, Deck: "db"},
					{Key: "scheme", Label: "Scheme", Cards: []string{"10010"}},
				},
				Decks: []pack.ScenarioDeck{
					{Key: "da", Label: "Deck A", Sets: []string{"sa"}, Encounter: true, Discard: true},
					{Key: "db", Label: "Deck B", Cards: []string{"12001", "12002"}},
				},
				Start: map[pack.Difficulty]pack.Start{pack.Standard: {
					Top: map[string]pack.FaceRef{
						"v1": {Card: "10001"}, "v2": {Card: "10004"}, "scheme": {Card: "10010"},
					},
					InPlay: []pack.FaceRef{{Card: "10003", With: "v1"}, {Card: "10006", With: "v2"}},
				}},
			},
			{
				ID: "leftover", VillainSet: "vs_l", SelfContained: true,
				Piles: []pack.Pile{{Key: "v1", Label: "One", Cards: []string{"10001", "10002"}}},
				Decks: []pack.ScenarioDeck{{Key: "da", Label: "Deck A", Sets: []string{"sa"}, Encounter: true}},
				Start: map[pack.Difficulty]pack.Start{pack.Standard: {Top: map[string]pack.FaceRef{"v1": {Card: "10001"}}}},
			},
			{
				ID: "ordered", VillainSet: "vs_o", SelfContained: true,
				Piles: []pack.Pile{{Key: "v1", Label: "One", Cards: []string{"10001", "10002"}}},
				Decks: []pack.ScenarioDeck{
					{Key: "ob", Label: "Ordered", Cards: []string{"12001", "12002", "11001"}, Ordered: true},
				},
				Start: map[pack.Difficulty]pack.Start{pack.Standard: {Top: map[string]pack.FaceRef{"v1": {Card: "10001"}}}},
			},
		},
	}
	data, err := json.Marshal(file)
	if err != nil {
		t.Fatal(err)
	}
	index, err := json.Marshal(pack.Index{
		Version: 1, Lang: "en", Packs: []pack.PackRef{{Code: "t", Name: "Test", File: "t.json"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	cat, err := pack.Load(fstest.MapFS{"en/index.json": {Data: index}, "en/t.json": {Data: data}}, "en")
	if err != nil {
		t.Fatal(err)
	}
	return cat
}

// scenarioTable runs the scenario setup of the in-test catalog on a table of one seat.
func scenarioTable(t *testing.T, id string) (*tableBuilder, error) {
	t.Helper()
	b := &tableBuilder{cat: setupCatalog(t), rng: newTestRNG(), table: newEmptyTable(1)}
	scenario, err := b.setupScenario(LobbyConfig{Scenario: id, Difficulty: pack.Standard})
	if err != nil {
		return b, err
	}
	return b, b.setupScenarioDecks(scenario)
}

func mustScenarioTable(t *testing.T, id string) *Table {
	t.Helper()
	b, err := scenarioTable(t, id)
	if err != nil {
		t.Fatal(err)
	}
	return b.table
}

func stageX(t *testing.T, table *Table, key string) int {
	t.Helper()
	for _, s := range table.Stages {
		if s.Key == key {
			return table.Cards[s.Current].X
		}
	}
	t.Fatalf("no stage %q", key)
	return 0
}

func TestClassicLayoutUnchanged(t *testing.T) {
	table := mustScenarioTable(t, "classic")
	if got := stageX(t, table, "villain"); got != 360 {
		t.Errorf("villain x = %d, want 360", got)
	}
	if got := stageX(t, table, "scheme"); got != 550 {
		t.Errorf("scheme x = %d, want 550", got)
	}
	if got := table.Cards[cardWithCode(t, table, "20004").ID].X; got != 800 {
		t.Errorf("first in-play x = %d, want 800", got)
	}
	if table.Piles[PileEncounter] == nil || table.Piles[PileEncounterDiscard].X != 160 {
		t.Errorf("classic encounter piles = %+v", table.Piles)
	}
	if table.Active != nil {
		t.Errorf("Active = %+v, want none", table.Active)
	}
	if n := len(table.Piles[PileEncounter].Cards); n != 2 {
		t.Errorf("encounter deck has %d cards, want the 2 copies of 20003", n)
	}
}

func TestScenarioDeckGroups(t *testing.T) {
	table := mustScenarioTable(t, "twice")

	for _, want := range []struct {
		id    string
		kind  PileKind
		x     int
		label string
		cards int
	}{
		{"enc:da", KindEncounter, 0, "Deck A", 5},
		{"encd:da", KindEncounterDiscard, 120, "Deck A", 0},
		{"sdeck:db", KindScenarioDeck, 730, "Deck B", 5},
	} {
		p := table.Piles[want.id]
		if p == nil {
			t.Fatalf("no pile %s", want.id)
		}
		if p.Kind != want.kind || p.X != want.x || p.Y != 30 || p.Label != want.label || !p.Compact ||
			p.Owner != NoOwner || len(p.Cards) != want.cards {
			t.Errorf("%s = %+v, want kind %s at x %d, label %q, %d cards", want.id, p, want.kind, want.x, want.label, want.cards)
		}
		for _, id := range p.Cards {
			if table.Cards[id].Home != want.id {
				t.Errorf("card %s home = %q, want %s", id, table.Cards[id].Home, want.id)
			}
		}
	}
	if table.Piles["sdisc:db"] != nil {
		t.Error("deck without discard has a discard pile")
	}
	// v1 280, its side scheme 470 (landscape, ends 666), the deck of v2 730, v2 after it, then its side scheme and the
	// main scheme, each inPlayGap past the previous card.
	for key, want := range map[string]int{"v1": 280, "v2": 890, "scheme": 1330} {
		if got := stageX(t, table, key); got != want {
			t.Errorf("stage %s x = %d, want %d", key, got, want)
		}
	}
	if got := table.Cards[cardWithCode(t, table, "10003").ID].X; got != 470 {
		t.Errorf("side scheme of v1 x = %d, want 470", got)
	}
	if got := table.Cards[cardWithCode(t, table, "10006").ID].X; got != 1080 {
		t.Errorf("side scheme of v2 x = %d, want 1080", got)
	}
}

func TestActiveStartsUnderVillain(t *testing.T) {
	table := mustScenarioTable(t, "twice")
	want := Point{X: 280 + 40, Y: 30 + 196 + 24}
	if table.Active == nil || *table.Active != want {
		t.Errorf("Active = %+v, want %+v", table.Active, want)
	}
}

func TestNoClassicEncounterDeck(t *testing.T) {
	table := mustScenarioTable(t, "twice")
	if table.Piles[PileEncounter] != nil || table.Piles[PileEncounterDiscard] != nil {
		t.Error("an encounter scenario deck leaves the classic encounter deck on the table")
	}
	if table.Piles[PileVictory] == nil || table.Piles[PileScenarioAside] == nil {
		t.Error("out-of-play piles are missing")
	}

	_, err := scenarioTable(t, "leftover")
	if !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "13001") {
		t.Errorf("leftover villain-set card error = %v, want ErrInvalid naming 13001", err)
	}
}

func TestSelfContainedNoObligation(t *testing.T) {
	for _, id := range []string{"twice", "classic"} {
		b, err := scenarioTable(t, id)
		if err != nil {
			t.Fatal(err)
		}
		if err := b.setupPlayer(0, &DeckChoice{Hero: "01001a"}); err != nil {
			t.Fatal(err)
		}
		selfContained := id == "twice"
		hasObligation := slices.ContainsFunc(slices.Collect(maps.Values(b.table.Cards)), func(c *Card) bool {
			return c.Code == "01090"
		})
		hasNemesis := len(b.table.Piles["aside:"+string(PlayerArea(0))].Cards) > 0
		if hasObligation == selfContained || hasNemesis == selfContained {
			t.Errorf("%s: obligation %v, nemesis aside %v, self-contained %v", id, hasObligation, hasNemesis, selfContained)
		}
	}
}

func TestSelfContainedConfigCleared(t *testing.T) {
	cat := setupCatalog(t)
	cfg := DefaultConfig(cat, "twice")
	if cfg.Standard != "" || cfg.Expert != "" || len(cfg.Modulars) != 0 || cfg.Modulars == nil {
		t.Errorf("DefaultConfig = %+v, want no sets and a non-nil Modulars", cfg)
	}

	g := mustNewGame(t, "g1", "h", "Host", testNow)
	chosen := LobbyConfig{Scenario: "twice", Difficulty: pack.Standard, Standard: "standard", Modulars: []string{"m"}}
	if err := g.Configure("h", chosen, cat); err != nil {
		t.Fatalf("Configure() error = %v", err)
	}
	if g.Config.Standard != "" || g.Config.Expert != "" || len(g.Config.Modulars) != 0 || g.Config.Modulars == nil {
		t.Errorf("Config = %+v, want the sets cleared", g.Config)
	}

	if err := validateConfig(LobbyConfig{Scenario: "twice", Difficulty: pack.Standard}, cat); err != nil {
		t.Errorf("validateConfig(no sets) = %v", err)
	}
}

func TestOrderedDeckTopFirst(t *testing.T) {
	table := mustScenarioTable(t, "ordered")
	pile := table.Piles["sdeck:ob"]
	if pile == nil {
		t.Fatal("no ordered deck pile")
	}
	// The top is the last card of the pile: it lists the first listed card last.
	var top []string
	for i := len(pile.Cards) - 1; i >= 0; i-- {
		top = append(top, table.Cards[pile.Cards[i]].Code)
	}
	want := []string{"12001", "12002", "12002", "12002", "12002", "11001", "11001"}
	if !slices.Equal(top, want) {
		t.Errorf("ordered deck from the top = %v, want %v", top, want)
	}
}

func TestStageCardsHaveTheirDeckAsHome(t *testing.T) {
	table := mustScenarioTable(t, "twice")
	scheme, sideScheme := table.Cards[cardWithCode(t, table, "10003").ID], table.Cards[cardWithCode(t, table, "10006").ID]
	if scheme.Home != "enc:da" || sideScheme.Home != "sdeck:db" {
		t.Errorf("homes of the side schemes = %q, %q, want enc:da, sdeck:db", scheme.Home, sideScheme.Home)
	}
	if v := table.Cards[cardWithCode(t, table, "10001").ID]; v.Home != "enc:da" {
		t.Errorf("stage card home = %q, want enc:da", v.Home)
	}
	if m := table.Cards[cardWithCode(t, table, "10010").ID]; m.Home != PileEncounter {
		t.Errorf("stage card without a deck has home %q, want %q", m.Home, PileEncounter)
	}

	// A card tucked under the side scheme leaves with it.
	tucked := table.Cards[cardWithCode(t, table, "10006").ID]
	tucked.Parent, tucked.X, tucked.Y = scheme.ID, scheme.X, scheme.Y
	mustApply(t, table, renamedTo(Action{Kind: ActDiscard, Card: scheme.ID}, tucked.ID))
	if got := table.Piles["encd:da"].Cards; !slices.Equal(got, []string{scheme.ID}) {
		t.Errorf("encd:da = %v, want [%s]", got, scheme.ID)
	}
	if tucked.Parent != "" || tucked.Zone != ZonePile || tucked.Pile != "sdeck:db" {
		t.Errorf("tucked card = %+v, want back in sdeck:db", tucked)
	}
}
