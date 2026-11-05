package packs_test

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"maps"
	"os"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/alexandreroman/intothefray/internal/game"
	"github.com/alexandreroman/intothefray/internal/pack"
	"github.com/alexandreroman/intothefray/internal/packgen/cdn"
	"github.com/alexandreroman/intothefray/packs"
)

func TestEmbeddedCoreSet(t *testing.T) {
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}

	t.Run("rhino scenario", func(t *testing.T) {
		rhino, ok := catalog.Scenario("rhino")
		if !ok {
			t.Fatal("scenario rhino not found")
		}
		want := pack.FaceRef{Card: "01095", Face: 0}
		if got := rhino.Start[pack.Expert].Top["villain"]; got != want {
			t.Errorf("expert villain = %+v, want %+v", got, want)
		}
		if !slices.Contains(rhino.Recommended, "bomb_scare") {
			t.Errorf("Recommended = %v, want bomb_scare", rhino.Recommended)
		}
	})

	t.Run("main scheme back face", func(t *testing.T) {
		card, face, err := catalog.Card("01097b")
		if err != nil {
			t.Fatalf("Card(01097b) error = %v", err)
		}
		if face != 1 {
			t.Errorf("face = %d, want 1", face)
		}
		threat := card.Faces[face].StartingThreat
		if threat == nil || *threat != (pack.Threat{}) {
			t.Errorf("StartingThreat = %v, want {0 false}", threat)
		}
	})

	t.Run("curated face sizes", func(t *testing.T) {
		tests := []struct {
			code string
			want pack.Size
		}{
			{"12001c", pack.SizeDoubleStd},
			{"42001c", pack.SizeDoubleLand},
		}
		for _, tt := range tests {
			card, face, err := catalog.Card(tt.code)
			if err != nil {
				t.Fatalf("Card(%s) error = %v", tt.code, err)
			}
			if face != 2 {
				t.Errorf("Card(%s) face = %d, want 2", tt.code, face)
			}
			if got := card.Faces[2].Size; got != tt.want {
				t.Errorf("Card(%s) size = %q, want %q", tt.code, got, tt.want)
			}
		}
	})

	t.Run("swapped Cerebro images", func(t *testing.T) {
		// Cerebro labels Storm's faces the wrong way round, so sources.json takes the hero image from 36001B and the
		// alter ego image from 36001A; the packs then show the manifest image of each face.
		manifest, err := cdn.LoadManifest("images/manifest.json")
		if err != nil {
			t.Fatal(err)
		}
		sources := loadImageSources(t)
		card, _, err := catalog.Card("36001")
		if err != nil {
			t.Fatalf("Card(36001) error = %v", err)
		}
		tests := []struct {
			face     int
			faceType string
			code     string
			cerebro  string
		}{
			{0, "hero", "36001a", "/36001B.jpg"},
			{1, "alter_ego", "36001b", "/36001A.jpg"},
		}
		for _, tt := range tests {
			if got := sources[tt.code].Cerebro; !strings.HasSuffix(got, tt.cerebro) {
				t.Errorf("sources.json Cerebro image of %s = %q, want one ending in %s", tt.code, got, tt.cerebro)
			}
			want, ok := manifest.Image(tt.code, "en")
			if !ok {
				t.Fatalf("manifest has no en image of %s", tt.code)
			}
			face := card.Faces[tt.face]
			if face.Type != tt.faceType || len(face.Images) == 0 || face.Images[0] != want {
				t.Errorf("Storm face %d = %s with images %v, want %s with first image %s",
					tt.face, face.Type, face.Images, tt.faceType, want)
			}
		}
	})

	t.Run("lettered codes that are distinct cards", func(t *testing.T) {
		tests := []struct {
			code         string
			wantQuantity int
		}{
			{"01043a", 1},
			{"01043d", 2},
		}
		for _, tt := range tests {
			card, face, err := catalog.Card(tt.code)
			if err != nil {
				t.Fatalf("Card(%s) error = %v", tt.code, err)
			}
			if card.Code != tt.code || face != 0 || len(card.Faces) != 1 || card.Quantity != tt.wantQuantity {
				t.Errorf("Card(%s) = code %s, face %d, %d faces, quantity %d; want a single-face card of quantity %d",
					tt.code, card.Code, face, len(card.Faces), card.Quantity, tt.wantQuantity)
			}
		}
	})

	t.Run("hero obligation", func(t *testing.T) {
		hero, ok := catalog.HeroByIdentity("01001a")
		if !ok {
			t.Fatal("hero 01001a not found")
		}
		if hero.Obligation != "01165" {
			t.Errorf("Obligation = %q, want 01165", hero.Obligation)
		}
	})

	t.Run("index", func(t *testing.T) {
		scenarios := catalog.Index().Scenarios
		if len(scenarios) <= 40 {
			t.Errorf("scenario refs = %d, want more than 40", len(scenarios))
		}
		supported := 0
		for _, ref := range scenarios {
			if ref.Supported {
				supported++
			}
		}
		if supported != 22 {
			t.Errorf("supported scenarios = %d, want 22", supported)
		}
	})
}

// TestEmbeddedFearNoEvil checks the pack that marvelcdb lists only partly and
// mc4db completes.
func TestEmbeddedFearNoEvil(t *testing.T) {
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}

	t.Run("kingpin scenario", func(t *testing.T) {
		index := slices.IndexFunc(catalog.Index().Scenarios, func(ref pack.ScenarioRef) bool {
			return ref.ID == "kingpin"
		})
		if index < 0 {
			t.Fatal("scenario ref kingpin not found")
		}
		ref := catalog.Index().Scenarios[index]
		if !ref.Supported || ref.Pack != "fne" {
			t.Errorf("kingpin ref = supported %t in pack %q, want supported in pack fne", ref.Supported, ref.Pack)
		}
	})

	t.Run("villain and main scheme", func(t *testing.T) {
		tests := []struct {
			code      string
			wantFaces int
		}{
			{"60159", 2},
			{"60161", 2},
		}
		for _, tt := range tests {
			card, _, err := catalog.Card(tt.code)
			if err != nil {
				t.Fatalf("Card(%s) error = %v", tt.code, err)
			}
			if len(card.Faces) != tt.wantFaces {
				t.Errorf("Card(%s) faces = %d, want %d", tt.code, len(card.Faces), tt.wantFaces)
			}
		}
	})

	t.Run("underling set", func(t *testing.T) {
		set, ok := catalog.Set("bullseye")
		if !ok {
			t.Fatal("set bullseye not found")
		}
		if set.Kind != "underling" {
			t.Errorf("bullseye kind = %q, want underling", set.Kind)
		}
	})

	mainSchemes := []string{
		"art_museum_heist", "the_getaway", "protection_racket", "stop_the_presses", "the_raft_breakout",
	}

	t.Run("underling scenarios", func(t *testing.T) {
		tests := []struct {
			id      string
			villain pack.FaceRef
			inPlay  []pack.FaceRef
		}{
			{id: "bullseye", villain: pack.FaceRef{Card: "60065", Face: 0}},
			{id: "electro", villain: pack.FaceRef{Card: "60076", Face: 0}},
			{id: "hammerhead", villain: pack.FaceRef{Card: "60086", Face: 0}},
			{id: "purple_man", villain: pack.FaceRef{Card: "60097", Face: 0}},
			{
				id:      "typhoid_mary",
				villain: pack.FaceRef{Card: "60110", Face: 0},
				inPlay:  []pack.FaceRef{{Card: "60112", Face: 0}, {Card: "60113", Face: 0}},
			},
		}
		for _, tt := range tests {
			index := slices.IndexFunc(catalog.Index().Scenarios, func(ref pack.ScenarioRef) bool {
				return ref.ID == tt.id
			})
			if index < 0 {
				t.Errorf("scenario ref %s not found", tt.id)
				continue
			}
			ref := catalog.Index().Scenarios[index]
			if !ref.Supported || ref.Pack != "fne" || len(ref.Recommended) != 0 ||
				!slices.Equal(ref.MainSchemes, mainSchemes) {
				t.Errorf("%s ref = %+v, want supported in pack fne, no recommended set, main schemes %v",
					tt.id, ref, mainSchemes)
			}
			scenario, ok := catalog.Scenario(tt.id)
			if !ok {
				t.Errorf("scenario %s not found", tt.id)
				continue
			}
			for _, difficulty := range []pack.Difficulty{pack.Standard, pack.Expert} {
				start := scenario.Start[difficulty]
				if got := start.Top["villain"]; got != tt.villain {
					t.Errorf("%s %s villain = %+v, want %+v", tt.id, difficulty, got, tt.villain)
				}
				if !slices.Equal(start.InPlay, tt.inPlay) {
					t.Errorf("%s %s in play = %v, want %v", tt.id, difficulty, start.InPlay, tt.inPlay)
				}
			}
		}
	})

	t.Run("main scheme sets", func(t *testing.T) {
		recommended := map[string][]string{
			"art_museum_heist":  {"cops", "the_owl"},
			"the_getaway":       {"cops", "drive"},
			"protection_racket": {"disasters", "tracksuit_mafia"},
			"stop_the_presses":  {"tombstone", "tracksuit_mafia"},
			"the_raft_breakout": {"the_owl", "tombstone"},
		}
		for _, code := range mainSchemes {
			if slices.ContainsFunc(catalog.Index().Scenarios, func(ref pack.ScenarioRef) bool { return ref.ID == code }) {
				t.Errorf("main scheme set %s is listed as a scenario", code)
			}
			index := slices.IndexFunc(catalog.Index().Sets, func(ref pack.SetRef) bool { return ref.Code == code })
			if index < 0 {
				t.Errorf("main scheme set %s is not in the index", code)
				continue
			}
			ref := catalog.Index().Sets[index]
			if ref.Kind != "main_scheme" || !slices.Equal(ref.Recommended, recommended[code]) {
				t.Errorf("set ref %s = %+v, want kind main_scheme, recommended %v", code, ref, recommended[code])
			}
		}

		// The cards a 1A Setup text names explicitly start in play: the Daily
		// Bugle environment, The Getaway's Out Front attachment (the face of
		// 60129 that is not Alongside) and The Raft Breakout's Master Key.
		// Art Museum Heist's Art attachment is drawn at random, so it stays
		// in the encounter deck.
		inPlay := map[string][]pack.FaceRef{
			"art_museum_heist":  nil,
			"the_getaway":       {{Card: "60129", Face: 0}},
			"protection_racket": nil,
			"stop_the_presses":  {{Card: "60152", Face: 0}},
			"the_raft_breakout": {{Card: "60143", Face: 0}},
		}
		for _, code := range mainSchemes {
			set, _ := catalog.Set(code)
			for _, difficulty := range []pack.Difficulty{pack.Standard, pack.Expert} {
				if got := set.InPlay[difficulty]; !slices.Equal(got, inPlay[code]) {
					t.Errorf("%s %s in play = %v, want %v", code, difficulty, got, inPlay[code])
				}
			}
		}
	})
}

// TestEmbeddedGreenGoblin checks the two scenarios of The Green Goblin.
func TestEmbeddedGreenGoblin(t *testing.T) {
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}

	t.Run("scenario refs", func(t *testing.T) {
		for _, id := range []string{"risky_business", "mutagen_formula"} {
			index := slices.IndexFunc(catalog.Index().Scenarios, func(ref pack.ScenarioRef) bool {
				return ref.ID == id
			})
			if index < 0 {
				t.Errorf("scenario ref %s not found", id)
				continue
			}
			ref := catalog.Index().Scenarios[index]
			if !ref.Supported || ref.Pack != "gob" {
				t.Errorf("%s ref = supported %t in pack %q, want supported in pack gob", id, ref.Supported, ref.Pack)
			}
		}
	})

	t.Run("starts", func(t *testing.T) {
		tests := []struct {
			scenario    string
			difficulty  pack.Difficulty
			wantVillain pack.FaceRef
			wantScheme  pack.FaceRef
			wantInPlay  []pack.FaceRef
		}{
			{
				scenario:    "risky_business",
				difficulty:  pack.Standard,
				wantVillain: pack.FaceRef{Card: "02001", Face: 0},
				wantScheme:  pack.FaceRef{Card: "02004", Face: 0},
				wantInPlay:  []pack.FaceRef{{Card: "02006", Face: 0}},
			},
			{
				scenario:    "risky_business",
				difficulty:  pack.Expert,
				wantVillain: pack.FaceRef{Card: "02002", Face: 0},
				wantScheme:  pack.FaceRef{Card: "02004", Face: 0},
				wantInPlay:  []pack.FaceRef{{Card: "02006", Face: 0}},
			},
			{
				scenario:    "mutagen_formula",
				difficulty:  pack.Standard,
				wantVillain: pack.FaceRef{Card: "02014", Face: 0},
				wantScheme:  pack.FaceRef{Card: "02017", Face: 0},
			},
			{
				scenario:    "mutagen_formula",
				difficulty:  pack.Expert,
				wantVillain: pack.FaceRef{Card: "02015", Face: 0},
				wantScheme:  pack.FaceRef{Card: "02017", Face: 0},
			},
		}
		for _, tt := range tests {
			scenario, ok := catalog.Scenario(tt.scenario)
			if !ok {
				t.Errorf("scenario %s not found", tt.scenario)
				continue
			}
			start := scenario.Start[tt.difficulty]
			if got := start.Top["villain"]; got != tt.wantVillain {
				t.Errorf("%s %s villain = %+v, want %+v", tt.scenario, tt.difficulty, got, tt.wantVillain)
			}
			if got := start.Top["scheme"]; got != tt.wantScheme {
				t.Errorf("%s %s scheme = %+v, want %+v", tt.scenario, tt.difficulty, got, tt.wantScheme)
			}
			if !slices.Equal(start.InPlay, tt.wantInPlay) {
				t.Errorf("%s %s in play = %v, want %v", tt.scenario, tt.difficulty, start.InPlay, tt.wantInPlay)
			}
		}
	})
}

func TestEmbeddedWreckingCrew(t *testing.T) {
	cat, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}

	t.Run("index", func(t *testing.T) {
		found := false
		for _, ref := range cat.Index().Scenarios {
			switch ref.ID {
			case "wrecker", "thunderball", "piledriver", "bulldozer":
				t.Errorf("scenario entry %s should be merged into wrecking_crew", ref.ID)
			case "wrecking_crew":
				found = true
				if !ref.Supported || !ref.SelfContained || !strings.Contains(ref.Image, "/cards/en/07002.") {
					t.Errorf("wrecking_crew ref = %+v, want supported, self-contained, image 07002", ref)
				}
			}
		}
		if !found {
			t.Error("scenario ref wrecking_crew not found")
		}
	})

	tests := []struct {
		difficulty pack.Difficulty
		villains   []string
	}{
		{pack.Standard, []string{"07002", "07017", "07032", "07046"}},
		{pack.Expert, []string{"07003", "07018", "07033", "07047"}},
	}
	keys := []string{"wrecker", "thunderball", "piledriver", "bulldozer"}
	sideSchemes := []string{"07004", "07019", "07034", "07048"}
	for _, tt := range tests {
		t.Run(string(tt.difficulty), func(t *testing.T) {
			cfg := game.LobbyConfig{Scenario: "wrecking_crew", Difficulty: tt.difficulty, Modulars: []string{}}
			g := startEmbeddedGame(t, cat, cfg, "01001a", "01010a")
			table := g.Table
			if _, ok := table.Piles["enc"]; ok {
				t.Error("classic enc pile exists")
			}
			for i, key := range keys {
				deck, disc := table.Piles["enc:"+key], table.Piles["encd:"+key]
				if deck == nil || disc == nil {
					t.Fatalf("missing piles enc:%s / encd:%s", key, key)
				}
				if len(deck.Cards) != 15 {
					t.Errorf("%s deck has %d cards, want 15", key, len(deck.Cards))
				}
				for _, id := range deck.Cards {
					if code := table.Cards[id].Code; code == "01165" || code == "01175" {
						t.Errorf("%s deck holds an obligation %s", key, code)
					}
				}
				// Players place the starting threat by hand.
				found := false
				for _, c := range table.Cards {
					if c.Code == sideSchemes[i] {
						found = true
						if c.Zone != game.ZoneTable {
							t.Errorf("%s not in play", c.Code)
						}
						if len(c.Tokens) != 0 {
							t.Errorf("%s tokens = %v, want none", c.Code, c.Tokens)
						}
					}
				}
				if !found {
					t.Errorf("side scheme %s not found", sideSchemes[i])
				}
			}
			for i, key := range keys {
				stage := slices.IndexFunc(table.Stages, func(s *game.Stage) bool { return s.Key == key })
				if stage < 0 {
					t.Fatalf("no stage %s", key)
				}
				if got := table.Cards[table.Stages[stage].Current].Code; got != tt.villains[i] {
					t.Errorf("stage %s shows %s, want %s", key, got, tt.villains[i])
				}
			}
			var scheme *game.Card
			for _, c := range table.Cards {
				if c.Code == "07001" {
					scheme = c
				}
			}
			if scheme == nil || scheme.Face != 0 {
				t.Errorf("Breakout = %+v, want face 0", scheme)
			}
			if table.Active == nil {
				t.Error("no active counter")
			}
			for _, c := range table.Cards {
				card, _, err := cat.Card(c.Code)
				if err != nil {
					continue
				}
				for _, face := range card.Faces {
					if face.Type == "obligation" {
						t.Errorf("obligation %s on the table", c.Code)
					}
				}
			}
			for seat := range 2 {
				if aside := table.Piles["aside:"+string(game.PlayerArea(seat))]; aside != nil && len(aside.Cards) > 0 {
					t.Errorf("seat %d set-aside pile holds %d cards, want none", seat, len(aside.Cards))
				}
			}

			// A side scheme returns to the deck of its villain.
			var side *game.Card
			for _, c := range table.Cards {
				if c.Code == "07004" {
					side = c
				}
			}
			if side == nil {
				t.Fatal("no side scheme 07004")
			}
			if err := g.Do("h", -1, game.Action{Kind: game.ActDiscard, Card: side.ID}, cat, time.Unix(1, 0)); err != nil {
				t.Fatalf("discard 07004 = %v", err)
			}
			if got := table.Piles["encd:wrecker"].Cards; !slices.Contains(got, side.ID) {
				t.Errorf("encd:wrecker = %v, want 07004 (%s)", got, side.ID)
			}
		})
	}
}

// TestEmbeddedRiseOfRedSkull checks the five scenarios of The Rise of Red
// Skull: their scenario decks, set-aside and in-play cards, and the sets the
// pack keeps out of the lobby or trims.
func TestEmbeddedRiseOfRedSkull(t *testing.T) {
	cat, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}

	t.Run("index", func(t *testing.T) {
		for _, id := range []string{"crossbones", "absorbing_man", "taskmaster", "zola", "red_skull"} {
			i := slices.IndexFunc(cat.Index().Scenarios, func(ref pack.ScenarioRef) bool { return ref.ID == id })
			if i < 0 {
				t.Errorf("scenario ref %s not found", id)
				continue
			}
			if ref := cat.Index().Scenarios[i]; !ref.Supported || ref.SelfContained || ref.Pack != "trors" {
				t.Errorf("%s ref = %+v, want supported, not self-contained, in pack trors", id, ref)
			}
		}
		for _, code := range []string{"hydra_camp", "expcamp", "exper_weapon"} {
			if set, ok := cat.Set(code); !ok || !set.Unlisted {
				t.Errorf("set %s = %+v, want unlisted", code, set)
			}
		}
		if set, _ := cat.Set("taskmaster"); slices.Contains(set.Cards, "10098") {
			t.Errorf("set taskmaster lists the player-side Shang-Chi 10098: %v", set.Cards)
		}
	})

	tests := []struct {
		scenario string
		// deck is the scenario deck and the cards it holds, out of the
		// encounter deck.
		deck      string
		deckCards []string
		// discard is the pile the deck's cards are discarded to.
		discard  string
		inPlay   []string
		setAside []string
		// encounterSets are the sets the scenario requires, every copy of
		// whose cards lies in the classic encounter deck.
		encounterSets []string
	}{
		{
			scenario:  "crossbones",
			deck:      "sdeck:weapons",
			deckCards: []string{"04072", "04073", "04074", "04075"},
			discard:   game.PileEncounterDiscard,
		},
		{
			scenario:  "red_skull",
			deck:      "sdeck:side_schemes",
			deckCards: []string{"04140", "04141", "04142", "04143", "04144"},
			discard:   "sdisc:side_schemes",
			inPlay:    []string{"04139"},
			setAside:  []string{"04130"},
		},
		{
			scenario:      "taskmaster",
			setAside:      []string{"04097", "04098", "04099", "04100"},
			encounterSets: []string{"hydra_patrol"},
		},
	}
	for _, tt := range tests {
		for _, difficulty := range []pack.Difficulty{pack.Standard, pack.Expert} {
			t.Run(tt.scenario+"/"+string(difficulty), func(t *testing.T) {
				cfg := game.LobbyConfig{Scenario: tt.scenario, Difficulty: difficulty, Modulars: []string{}}
				table := startEmbeddedGame(t, cat, cfg, "01001a").Table

				if tt.deck != "" {
					deck := table.Piles[tt.deck]
					if deck == nil {
						t.Fatalf("no pile %s", tt.deck)
					}
					var codes []string
					for _, id := range deck.Cards {
						codes = append(codes, table.Cards[id].Code)
					}
					slices.Sort(codes)
					if !slices.Equal(codes, tt.deckCards) {
						t.Errorf("%s holds %v, want %v", tt.deck, codes, tt.deckCards)
					}
					if deck.Discard != tt.discard || table.Piles[tt.discard] == nil {
						t.Errorf("%s discards to %q, want the existing pile %s", tt.deck, deck.Discard, tt.discard)
					}
				}
				// Each card lies in one place only: a deck card is out of
				// the encounter deck.
				want := map[string][]string{}
				for _, code := range tt.deckCards {
					want[code] = []string{tt.deck}
				}
				for _, code := range tt.inPlay {
					want[code] = []string{"table"}
				}
				for _, code := range tt.setAside {
					want[code] = []string{game.PileScenarioAside}
				}
				for _, setCode := range tt.encounterSets {
					set, ok := cat.Set(setCode)
					if !ok {
						t.Fatalf("no set %q", setCode)
					}
					for _, code := range set.Cards {
						card, _, err := cat.Card(code)
						if err != nil {
							t.Fatal(err)
						}
						want[card.Code] = slices.Repeat([]string{game.PileEncounter}, card.Quantity)
					}
				}
				for code, places := range want {
					if got := placesOf(table, code); !slices.Equal(got, places) {
						t.Errorf("copies of %s lie in %v, want %v", code, got, places)
					}
				}
				// Players place the starting threat by hand.
				for _, c := range table.Cards {
					if slices.Contains(tt.inPlay, c.Code) && len(c.Tokens) != 0 {
						t.Errorf("%s tokens = %v, want none", c.Code, c.Tokens)
					}
				}
			})
		}
	}

	// With the sets a lobby would bring, every card of the encounter sets and
	// of the scenario decks' sets exists exactly as many times as printed,
	// and the player-side Shang-Chi the Taskmaster set excludes nowhere.
	for _, id := range []string{"crossbones", "absorbing_man", "taskmaster", "zola", "red_skull"} {
		for _, difficulty := range []pack.Difficulty{pack.Standard, pack.Expert} {
			t.Run(id+"/"+string(difficulty)+"/copies", func(t *testing.T) {
				cfg := game.DefaultConfig(cat, id)
				cfg.Difficulty = difficulty
				if difficulty == pack.Expert {
					cfg.Expert = "expert"
				}
				table := startEmbeddedGame(t, cat, cfg, "01001a").Table

				scenario, _ := cat.Scenario(id)
				setCodes := append([]string{scenario.VillainSet, cfg.Standard, cfg.Expert}, scenario.Sets...)
				setCodes = append(setCodes, cfg.Modulars...)
				for _, deck := range scenario.Decks {
					setCodes = append(setCodes, deck.Sets...)
				}
				checkEmbeddedSetCopies(t, cat, table, setCodes)
				if got := placesOf(table, "10098"); len(got) != 0 {
					t.Errorf("10098 lies in %v, want nowhere", got)
				}
			})
		}
	}
}

// TestEmbeddedGalaxysMostWanted checks the five scenarios of The Galaxy's
// Most Wanted: their stages, the cards they start in play or set aside, the
// encounter sets they require with those sets' Setup cards (the Milano, the
// Power Stone), and the campaign sets the pack keeps out of the lobby.
func TestEmbeddedGalaxysMostWanted(t *testing.T) {
	cat, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}

	tests := []struct {
		scenario string
		// standard and expert are the villain cards each difficulty starts
		// on, scheme the main scheme both start on.
		standard pack.FaceRef
		expert   pack.FaceRef
		scheme   pack.FaceRef
		inPlay   []pack.FaceRef
		setAside []string
		sets     []string
		// table lists the cards setup lays on the table: the scenario's
		// in-play cards and the Setup cards of the sets it requires. The
		// other cards of those sets lie in the encounter deck.
		table []string
		// areas are the scenario's own out-of-play areas, empty at setup.
		areas []pack.ScenarioArea
		// lobbySets are the sets the index keeps out of the lobby, when they
		// are more than sets: a set the scenario sets aside comes with it too.
		lobbySets []string
	}{
		{
			scenario: "brotherhood_of_badoon",
			standard: pack.FaceRef{Card: "16058", Face: 0},
			expert:   pack.FaceRef{Card: "16059", Face: 0},
			scheme:   pack.FaceRef{Card: "16061", Face: 0},
			inPlay:   []pack.FaceRef{{Card: "16063", Face: 0}},
			sets:     []string{"ship_command"},
			table:    []string{"16063", "16142"},
		},
		{
			scenario: "infiltrate_the_museum",
			standard: pack.FaceRef{Card: "16070", Face: 0},
			expert:   pack.FaceRef{Card: "16071", Face: 0},
			scheme:   pack.FaceRef{Card: "16073", Face: 0},
			sets:     []string{"galactic_artifacts"},
			areas:    []pack.ScenarioArea{{Key: "collection", Label: "The Collection"}},
		},
		{
			// Ship Command waits aside, out of the encounter deck, and its
			// Milano does not start in play. The lobby does not offer it.
			scenario:  "escape_the_museum",
			standard:  pack.FaceRef{Card: "16080", Face: 0},
			expert:    pack.FaceRef{Card: "16081", Face: 0},
			scheme:    pack.FaceRef{Card: "16082", Face: 0},
			inPlay:    []pack.FaceRef{{Card: "16085", Face: 0}},
			setAside:  []string{"16142", "16143", "16144", "16145", "16146", "16147", "16148"},
			sets:      []string{"galactic_artifacts"},
			table:     []string{"16085"},
			lobbySets: []string{"galactic_artifacts", "ship_command"},
		},
		{
			scenario: "nebula",
			standard: pack.FaceRef{Card: "16088", Face: 0},
			expert:   pack.FaceRef{Card: "16089", Face: 0},
			scheme:   pack.FaceRef{Card: "16091", Face: 0},
			inPlay:   []pack.FaceRef{{Card: "16093", Face: 0}},
			sets:     []string{"power_stone", "ship_command"},
			table:    []string{"16093", "16142", "16149"},
		},
		{
			// The Universal Weapon lies by Ronan for the players to attach.
			scenario: "ronan",
			standard: pack.FaceRef{Card: "16103", Face: 0},
			expert:   pack.FaceRef{Card: "16104", Face: 0},
			scheme:   pack.FaceRef{Card: "16106", Face: 0},
			inPlay:   []pack.FaceRef{{Card: "16108", Face: 0}, {Card: "16109", Face: 0, With: "villain"}},
			sets:     []string{"power_stone", "ship_command"},
			table:    []string{"16108", "16109", "16142", "16149"},
		},
	}

	t.Run("index", func(t *testing.T) {
		for _, tt := range tests {
			i := slices.IndexFunc(cat.Index().Scenarios, func(ref pack.ScenarioRef) bool { return ref.ID == tt.scenario })
			if i < 0 {
				t.Errorf("scenario ref %s not found", tt.scenario)
				continue
			}
			ref := cat.Index().Scenarios[i]
			lobbySets := tt.sets
			if tt.lobbySets != nil {
				lobbySets = tt.lobbySets
			}
			if !ref.Supported || ref.SelfContained || ref.Pack != "gmw" || !slices.Equal(ref.Sets, lobbySets) {
				t.Errorf("%s ref = %+v, want supported, not self-contained, in pack gmw, with sets %v",
					tt.scenario, ref, lobbySets)
			}
		}
		for _, code := range []string{"the_market", "challenge", "badoon_headhunter"} {
			if set, ok := cat.Set(code); !ok || !set.Unlisted {
				t.Errorf("set %s = %+v, want unlisted", code, set)
			}
		}
	})

	for _, tt := range tests {
		t.Run(tt.scenario+"/starts", func(t *testing.T) {
			scenario, ok := cat.Scenario(tt.scenario)
			if !ok {
				t.Fatalf("scenario %s not found", tt.scenario)
			}
			villains := map[pack.Difficulty]pack.FaceRef{pack.Standard: tt.standard, pack.Expert: tt.expert}
			for difficulty, villain := range villains {
				start := scenario.Start[difficulty]
				if got := start.Top["villain"]; got != villain {
					t.Errorf("%s villain = %+v, want %+v", difficulty, got, villain)
				}
				if got := start.Top["scheme"]; got != tt.scheme {
					t.Errorf("%s scheme = %+v, want %+v", difficulty, got, tt.scheme)
				}
				if !slices.Equal(start.InPlay, tt.inPlay) {
					t.Errorf("%s in play = %v, want %v", difficulty, start.InPlay, tt.inPlay)
				}
			}
			if !slices.Equal(scenario.SetAside, tt.setAside) {
				t.Errorf("set aside = %v, want %v", scenario.SetAside, tt.setAside)
			}
			if !slices.Equal(scenario.Sets, tt.sets) {
				t.Errorf("sets = %v, want %v", scenario.Sets, tt.sets)
			}
			if !slices.Equal(scenario.Areas, tt.areas) {
				t.Errorf("areas = %v, want %v", scenario.Areas, tt.areas)
			}
		})

		for _, difficulty := range []pack.Difficulty{pack.Standard, pack.Expert} {
			t.Run(tt.scenario+"/"+string(difficulty), func(t *testing.T) {
				cfg := game.LobbyConfig{Scenario: tt.scenario, Difficulty: difficulty, Modulars: []string{}}
				table := startEmbeddedGame(t, cat, cfg, "01001a").Table

				// Each card lies in one place only: a card on the table or
				// set aside is out of the encounter deck.
				want := map[string][]string{}
				for _, setCode := range tt.sets {
					set, ok := cat.Set(setCode)
					if !ok {
						t.Fatalf("no set %q", setCode)
					}
					for _, code := range set.Cards {
						card, _, err := cat.Card(code)
						if err != nil {
							t.Fatal(err)
						}
						want[card.Code] = slices.Repeat([]string{game.PileEncounter}, card.Quantity)
					}
				}
				for _, code := range tt.table {
					want[code] = []string{"table"}
				}
				for _, code := range tt.setAside {
					want[code] = []string{game.PileScenarioAside}
				}
				for code, places := range want {
					if got := placesOf(table, code); !slices.Equal(got, places) {
						t.Errorf("copies of %s lie in %v, want %v", code, got, places)
					}
				}
				for _, area := range tt.areas {
					pile := table.Piles["area:"+area.Key]
					if pile == nil || pile.Label != area.Label || len(pile.Cards) != 0 {
						t.Errorf("area %s = %+v, want an empty pile labelled %q", area.Key, pile, area.Label)
					}
				}
			})
		}
	}

	// With the sets a lobby would bring, every card of the encounter sets
	// exists exactly as many times as printed.
	for _, tt := range tests {
		for _, difficulty := range []pack.Difficulty{pack.Standard, pack.Expert} {
			t.Run(tt.scenario+"/"+string(difficulty)+"/copies", func(t *testing.T) {
				cfg := game.DefaultConfig(cat, tt.scenario)
				cfg.Difficulty = difficulty
				if difficulty == pack.Expert {
					cfg.Expert = "expert"
				}
				table := startEmbeddedGame(t, cat, cfg, "01001a").Table

				scenario, _ := cat.Scenario(tt.scenario)
				setCodes := append([]string{scenario.VillainSet, cfg.Standard, cfg.Expert}, scenario.Sets...)
				setCodes = append(setCodes, cfg.Modulars...)
				checkEmbeddedSetCopies(t, cat, table, setCodes)
			})
		}
	}
}

// checkEmbeddedSetCopies verifies that every card of the given sets is on the
// table exactly as many times as its quantity. Empty set codes are skipped.
func checkEmbeddedSetCopies(t *testing.T, cat *pack.Catalog, table *game.Table, setCodes []string) {
	t.Helper()
	counts := map[string]int{}
	for _, c := range table.Cards {
		counts[c.Code]++
	}
	for _, setCode := range setCodes {
		if setCode == "" {
			continue
		}
		set, ok := cat.Set(setCode)
		if !ok {
			t.Fatalf("no set %q", setCode)
		}
		for _, code := range set.Cards {
			card, _, err := cat.Card(code)
			if err != nil {
				t.Fatal(err)
			}
			if got := counts[card.Code]; got != card.Quantity {
				t.Errorf("set %s: %d copies of %s, want %d", setCode, got, card.Code, card.Quantity)
			}
		}
	}
}

// startEmbeddedGame starts a game with the given lobby configuration and one
// deck of each hero, the first the host's, the others each another player's.
func startEmbeddedGame(t *testing.T, cat *pack.Catalog, cfg game.LobbyConfig, heroes ...string) *game.Game {
	t.Helper()
	g, err := game.NewGame("g1", "h", "Host", time.Unix(0, 0))
	if err != nil {
		t.Fatal(err)
	}
	tokens := []string{"h"}
	for i := 1; i < len(heroes); i++ {
		token := fmt.Sprintf("p%d", i)
		if _, err := g.Join(token, fmt.Sprintf("Player %d", i)); err != nil {
			t.Fatal(err)
		}
		tokens = append(tokens, token)
	}
	if err := g.Configure("h", cfg, cat); err != nil {
		t.Fatal(err)
	}
	for i, hero := range heroes {
		choice := game.DeckChoice{Name: "Deck", Hero: hero, HeroName: hero}
		if err := g.SetDeck(tokens[i], 0, choice, cat); err != nil {
			t.Fatal(err)
		}
	}
	if err := g.Start("h", cat, 1, time.Unix(0, 0)); err != nil {
		t.Fatal(err)
	}
	return g
}

// placesOf returns where each copy of a card lies: the id of its pile, or
// "table".
func placesOf(table *game.Table, code string) []string {
	var places []string
	for _, c := range table.Cards {
		if c.Code != code {
			continue
		}
		if c.Zone == game.ZoneTable {
			places = append(places, "table")
		} else {
			places = append(places, c.Pile)
		}
	}
	return places
}

// loadPackFiles decodes every embedded English pack file.
func loadPackFiles(t *testing.T) []pack.PackFile {
	t.Helper()
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	var files []pack.PackFile
	for _, ref := range catalog.Index().Packs {
		data, err := fs.ReadFile(packs.FS, "dist/"+ref.File)
		if err != nil {
			t.Fatal(err)
		}
		var file pack.PackFile
		if err := json.Unmarshal(data, &file); err != nil {
			t.Fatalf("decode %s: %v", ref.File, err)
		}
		files = append(files, file)
	}
	return files
}

func TestEmbeddedDataInvariants(t *testing.T) {
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}
	files := loadPackFiles(t)

	setCards := make(map[string][]string)
	for _, file := range files {
		for _, set := range file.Sets {
			setCards[set.Code] = set.Cards
		}
	}

	requireCard := func(t *testing.T, what, code string) {
		t.Helper()
		if _, _, err := catalog.Card(code); err != nil {
			t.Errorf("%s: %v", what, err)
		}
	}
	requireFace := func(t *testing.T, what string, ref pack.FaceRef) {
		t.Helper()
		card, _, err := catalog.Card(ref.Card)
		if err != nil {
			t.Errorf("%s: %v", what, err)
			return
		}
		if ref.Face < 0 || ref.Face >= len(card.Faces) {
			t.Errorf("%s: card %s has no face %d", what, ref.Card, ref.Face)
		}
	}

	t.Run("cards belong to their set", func(t *testing.T) {
		for _, file := range files {
			for _, card := range file.Cards {
				if card.Set != "" && !slices.Contains(setCards[card.Set], card.Code) {
					t.Errorf("card %s is not listed in its set %s", card.Code, card.Set)
				}
			}
		}
	})

	t.Run("set cards resolve", func(t *testing.T) {
		for set, codes := range setCards {
			for _, code := range codes {
				requireCard(t, "set "+set, code)
			}
		}
	})

	t.Run("heroes resolve", func(t *testing.T) {
		for _, file := range files {
			for _, hero := range file.Heroes {
				requireCard(t, "hero identity of "+hero.Set, hero.Identity)
				if hero.Obligation != "" {
					requireCard(t, "hero obligation of "+hero.Set, hero.Obligation)
				}
			}
		}
	})

	t.Run("scenarios resolve", func(t *testing.T) {
		for _, file := range files {
			for _, scenario := range file.Scenarios {
				what := "scenario " + scenario.ID
				for _, pile := range scenario.Piles {
					for _, code := range pile.Cards {
						requireCard(t, what, code)
					}
				}
				for _, code := range scenario.SetAside {
					requireCard(t, what, code)
				}
				for _, deck := range scenario.Decks {
					for _, code := range deck.Cards {
						requireCard(t, what+" deck "+deck.Key, code)
					}
					for _, code := range deck.Sets {
						if _, found := setCards[code]; !found {
							t.Errorf("%s deck %s: unknown set %s", what, deck.Key, code)
						}
					}
				}
				for _, start := range scenario.Start {
					for _, ref := range start.Top {
						requireFace(t, what, ref)
					}
					for _, ref := range start.InPlay {
						requireFace(t, what, ref)
					}
				}
			}
		}
	})

	// Players resolve the stage 1A "Setup:" text themselves, so the main
	// scheme starts on its first face, never already advanced to 1B. A
	// scenario played with a main scheme set has none of its own.
	t.Run("main schemes start on their first face", func(t *testing.T) {
		for _, file := range files {
			for _, scenario := range file.Scenarios {
				for difficulty, start := range scenario.Start {
					scheme, ok := start.Top["scheme"]
					if len(scenario.MainSchemes) > 0 {
						if ok {
							t.Errorf("scenario %s %s has a main scheme and main scheme sets", scenario.ID, difficulty)
						}
						continue
					}
					if !ok {
						t.Errorf("scenario %s %s has no main scheme", scenario.ID, difficulty)
						continue
					}
					if scheme.Face != 0 {
						t.Errorf("scenario %s %s starts its main scheme %s on face %d, want face 0",
							scenario.ID, difficulty, scheme.Card, scheme.Face)
					}
				}
			}
		}
	})

	// The only cards placed in play are the cards a scenario's printed setup
	// puts in play, environments and side schemes (Criminal Enterprise, Ultron
	// Drones, Public Support, Day of Reckoning), and the attachments it gives
	// a villain, laid out with that villain's stage for the players to attach
	// (Ronan's Universal Weapon): any other card stays in the encounter deck
	// for the players.
	t.Run("scenario in-play cards are environments, side schemes or stage attachments", func(t *testing.T) {
		for _, file := range files {
			for _, scenario := range file.Scenarios {
				for difficulty, start := range scenario.Start {
					for _, ref := range start.InPlay {
						card, _, err := catalog.Card(ref.Card)
						if err != nil || ref.Face < 0 || ref.Face >= len(card.Faces) {
							continue // reported by "scenarios resolve"
						}
						switch got := card.Faces[ref.Face].Type; {
						case got == "environment" || got == "side_scheme":
						case got == "attachment" && ref.With != "":
						default:
							t.Errorf("scenario %s %s starts %s face %d in play, a %s, "+
								"want an environment, a side scheme or an attachment with a stage",
								scenario.ID, difficulty, ref.Card, ref.Face, got)
						}
					}
				}
			}
		}
	})

	t.Run("scenario main scheme sets are offered", func(t *testing.T) {
		for _, file := range files {
			for _, scenario := range file.Scenarios {
				for _, code := range scenario.MainSchemes {
					listed := slices.ContainsFunc(catalog.Index().Sets, func(ref pack.SetRef) bool {
						return ref.Code == code && ref.Kind == "main_scheme"
					})
					if !listed {
						t.Errorf("scenario %s names main scheme set %s, which the index does not offer", scenario.ID, code)
					}
				}
			}
		}
	})

	t.Run("set in-play cards resolve", func(t *testing.T) {
		for _, file := range files {
			for _, set := range file.Sets {
				for _, refs := range set.InPlay {
					for _, ref := range refs {
						requireFace(t, "set "+set.Code, ref)
						if !slices.Contains(set.Cards, ref.Card) {
							t.Errorf("set %s starts card %s in play, which it does not list", set.Code, ref.Card)
						}
					}
				}
			}
		}
	})

	t.Run("unlisted sets stay out of the index", func(t *testing.T) {
		for _, file := range files {
			for _, set := range file.Sets {
				listed := slices.ContainsFunc(catalog.Index().Sets, func(ref pack.SetRef) bool {
					return ref.Code == set.Code
				})
				if set.Unlisted && listed {
					t.Errorf("unlisted set %s is in the index", set.Code)
				}
			}
		}
	})

	t.Run("set-aside cards resolve", func(t *testing.T) {
		for _, file := range files {
			for _, set := range file.Sets {
				for _, code := range set.SetAside {
					requireCard(t, "set-aside card of "+set.Code, code)
				}
			}
		}
	})

	t.Run("hero side decks are side-deck sets", func(t *testing.T) {
		sets := make(map[string]pack.Set)
		for _, file := range files {
			for _, set := range file.Sets {
				sets[set.Code] = set
			}
		}
		for _, file := range files {
			for _, hero := range file.Heroes {
				for _, code := range hero.SideDecks {
					if set := sets[code]; set.Side == nil || set.Kind != "hero_special" {
						t.Errorf("hero %s lists side deck %s, which is not a hero_special side-deck set", hero.Identity, code)
					}
				}
			}
		}
	})

	t.Run("ultron set lists its lettered cards", func(t *testing.T) {
		for _, code := range []string{"01144a", "01144b", "01144c"} {
			if !slices.Contains(setCards["ultron"], code) {
				t.Errorf("set ultron does not list %s", code)
			}
		}
	})
}

func TestEmbeddedHeroSetup(t *testing.T) {
	files := loadPackFiles(t)
	sets := make(map[string]pack.Set)
	heroes := make(map[string]pack.Hero)
	backs := make(map[string]pack.Back)
	for _, file := range files {
		for _, set := range file.Sets {
			sets[set.Code] = set
		}
		for _, card := range file.Cards {
			backs[card.Code] = card.Back
		}
		for _, hero := range file.Heroes {
			heroes[hero.Identity] = hero
		}
	}

	t.Run("side decks", func(t *testing.T) {
		type sideDeck struct {
			set  string
			side pack.SideDeck
		}
		tests := []struct {
			identity string
			want     []sideDeck // in printed order
		}{
			{"09001", []sideDeck{
				{"doctor_strange_invocation_deck", pack.SideDeck{
					Label: "Invocation", TopFaceUp: true, Discard: pack.DiscardOwn, Back: pack.BackPlayer,
				}},
			}},
			{"36001", []sideDeck{{"storm_weather_deck", pack.SideDeck{
				Label: "Weather", Discard: pack.DiscardNone, Back: pack.BackPlayer,
			}}}},
			{"59001", []sideDeck{
				{"hercules_labor_deck", pack.SideDeck{Label: "Labor", Discard: pack.DiscardNone, Back: pack.BackPlayer}},
				{"hercules_gift_deck", pack.SideDeck{Label: "Gift", Discard: pack.DiscardNone, Back: pack.BackEncounter}},
			}},
			{"60001", []sideDeck{
				{"daredevil_sense_deck", pack.SideDeck{
					Label: "Sense", TopFaceUp: true, Discard: pack.DiscardNone, Back: pack.BackPlayer,
				}},
			}},
		}
		for _, tt := range tests {
			var wantCodes []string
			for _, want := range tt.want {
				wantCodes = append(wantCodes, want.set)
				if got := sets[want.set].Side; got == nil || *got != want.side {
					t.Errorf("set %s side = %+v, want %+v", want.set, got, want.side)
				}
			}
			if got := heroes[tt.identity].SideDecks; !slices.Equal(got, wantCodes) {
				t.Errorf("hero %s side decks = %v, want %v", tt.identity, got, wantCodes)
			}
		}
	})

	t.Run("side deck backs", func(t *testing.T) {
		// Protect Humanity (59004) comes with an encounter back from the
		// sources: in a face-down Labor deck of player backs it would stand
		// out. Every committed side deck has a printed back its cards share.
		for _, set := range sets {
			if set.Side == nil {
				continue
			}
			if set.Side.Back == "" {
				t.Errorf("side deck %s has no shared back", set.Code)
				continue
			}
			for _, code := range set.Cards {
				if backs[code] != set.Side.Back {
					t.Errorf("card %s of %s has back %q, want %q", code, set.Code, backs[code], set.Side.Back)
				}
			}
		}
	})

	t.Run("set-aside cards", func(t *testing.T) {
		tests := []struct {
			set  string
			want []string
		}{
			{"iceman", []string{"46002"}},
			{"valk", []string{"25002"}},
			{"rogue", []string{"38002"}},
			{"ironheart", []string{"29002", "29003"}},
		}
		for _, tt := range tests {
			if got := sets[tt.set].SetAside; !slices.Equal(got, tt.want) {
				t.Errorf("set %s set-aside cards = %v, want %v", tt.set, got, tt.want)
			}
		}
	})
}

// TestDistHasNoNull guards the frontend, which types every list as a plain
// array: a nil Go slice would reach it as null.
func TestDistHasNoNull(t *testing.T) {
	err := fs.WalkDir(packs.FS, "dist", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(name, ".json") {
			return err
		}
		data, err := fs.ReadFile(packs.FS, name)
		if err != nil {
			return err
		}
		var doc any
		if err := json.Unmarshal(data, &doc); err != nil {
			return fmt.Errorf("decode %s: %w", name, err)
		}
		if path, found := findNull(doc, "$"); found {
			t.Errorf("%s: null at %s", name, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}

// findNull returns the path of the first JSON null in doc.
func findNull(doc any, path string) (string, bool) {
	switch v := doc.(type) {
	case nil:
		return path, true
	case []any:
		for i, item := range v {
			if p, found := findNull(item, fmt.Sprintf("%s[%d]", path, i)); found {
				return p, true
			}
		}
	case map[string]any:
		for key, item := range v {
			if p, found := findNull(item, path+"."+key); found {
				return p, true
			}
		}
	}
	return "", false
}

// loadImageSources reads the committed packs/images/sources.json, keyed by face code.
func loadImageSources(t *testing.T) map[string]cdn.SourceFace {
	t.Helper()
	data, err := os.ReadFile("images/sources.json")
	if err != nil {
		t.Fatal(err)
	}
	var file struct {
		Faces []cdn.SourceFace `json:"faces"`
	}
	if err := json.Unmarshal(data, &file); err != nil {
		t.Fatalf("decode images/sources.json: %v", err)
	}
	sources := make(map[string]cdn.SourceFace, len(file.Faces))
	for _, face := range file.Faces {
		sources[face.Code] = face
	}
	return sources
}

// TestEmbeddedImagesOnCDN guards that every image the app shows comes from the image CDN.
func TestEmbeddedImagesOnCDN(t *testing.T) {
	manifest, err := cdn.LoadManifest("images/manifest.json")
	if err != nil {
		t.Fatal(err)
	}
	catalog, err := packs.Catalog()
	if err != nil {
		t.Fatalf("Catalog() error = %v", err)
	}

	type offender struct{ where, url string }
	var offenders []offender
	check := func(where string, urls ...string) {
		for _, url := range urls {
			// An empty image means the entry has none, as for a scenario whose villain has no image.
			if url != "" && !strings.HasPrefix(url, manifest.Base) {
				offenders = append(offenders, offender{where, url})
			}
		}
	}
	checkLocalized := func(where string, localized map[string]pack.Localized) {
		for _, lang := range slices.Sorted(maps.Keys(localized)) {
			check(where+" "+lang, localized[lang].Images...)
		}
	}

	for _, file := range loadPackFiles(t) {
		for _, card := range file.Cards {
			for i, face := range card.Faces {
				where := fmt.Sprintf("card %s face %d", card.Code, i)
				check(where, face.Images...)
				checkLocalized(where, face.Localized)
			}
		}
	}
	index := catalog.Index()
	for _, ref := range index.Packs {
		checkLocalized("pack "+ref.Code, ref.Localized)
	}
	for _, ref := range index.Scenarios {
		check("scenario "+ref.ID, ref.Image)
		checkLocalized("scenario "+ref.ID, ref.Localized)
	}
	for _, ref := range index.Sets {
		checkLocalized("set "+ref.Code, ref.Localized)
	}

	const shown = 5
	for _, o := range offenders[:min(len(offenders), shown)] {
		t.Errorf("%s: image %s is not under %s", o.where, o.url, manifest.Base)
	}
	if len(offenders) > shown {
		t.Errorf("and %d more images off the CDN", len(offenders)-shown)
	}
}
