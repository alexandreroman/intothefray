// Package pack defines the JSON schema of the card-pack files generated from
// marvelcdb and Cerebro, and of the index that lists them.
package pack

// Size is the physical format of a card face.
type Size string

// Supported card sizes: standard or landscape, single or double-sided.
const (
	SizeStd        Size = "std"
	SizeLand       Size = "land"
	SizeDoubleStd  Size = "dstd"
	SizeDoubleLand Size = "dland"
)

// Back is the kind of card back shared by a card's faces.
type Back string

// Supported card backs.
const (
	BackPlayer    Back = "player"
	BackEncounter Back = "encounter"
	BackVillain   Back = "villain"
)

// Difficulty selects the scenario setup variant.
type Difficulty string

// Supported difficulties.
const (
	Standard Difficulty = "standard"
	Expert   Difficulty = "expert"
)

// Threat is a threat amount, fixed or scaled by the number of players.
type Threat struct {
	Value     int  `json:"value"`
	PerPlayer bool `json:"perPlayer"`
}

// Face is one printed side of a card.
type Face struct {
	Name           string   `json:"name"`
	Subname        string   `json:"subname,omitempty"`
	Type           string   `json:"type"`            // marvelcdb type_code
	Stage          string   `json:"stage,omitempty"` // "I", "1A"...
	Size           Size     `json:"size"`
	Images         []string `json:"images"` // tried in order
	HandSize       int      `json:"handSize,omitempty"`
	StartingThreat *Threat  `json:"startingThreat,omitempty"`
	// Localized holds the overrides of the face per language code, e.g. "fr".
	Localized map[string]Localized `json:"localized,omitempty"`
}

// Localized holds the overrides of a face or an index entry in one language;
// empty fields fall back to English. Index entries only use Name.
type Localized struct {
	Name    string   `json:"name,omitempty"`
	Subname string   `json:"subname,omitempty"`
	Images  []string `json:"images,omitempty"` // tried before the English images
}

// IsZero reports whether the override has nothing to override, so it would
// only add an empty entry to the JSON.
func (l Localized) IsZero() bool {
	return l.Name == "" && l.Subname == "" && len(l.Images) == 0
}

// Card is a physical card with one or more faces.
type Card struct {
	Code     string   `json:"code"` // canonical base code, e.g. "01097"
	Faces    []Face   `json:"faces"`
	Set      string   `json:"set,omitempty"` // marvelcdb card_set_code
	Back     Back     `json:"back"`
	Quantity int      `json:"quantity"`
	Aliases  []string `json:"aliases,omitempty"` // face codes and reprint codes resolving here
}

// Set is a named group of cards (hero, villain, modular, standard, expert...).
type Set struct {
	Code  string   `json:"code"`
	Name  string   `json:"name"`
	Kind  string   `json:"kind"`
	Cards []string `json:"cards"`
	// InPlay lists, per difficulty, the cards of the set that start in play
	// instead of in the encounter deck (the "Setup." keyword).
	InPlay map[Difficulty][]FaceRef `json:"inPlay,omitempty"`
	// Unlisted sets are left out of the lobby, e.g. the PvP standard set.
	Unlisted bool `json:"unlisted,omitempty"`
}

// Hero links a hero identity card to its set, obligation and nemesis.
type Hero struct {
	Identity   string `json:"identity"`
	Set        string `json:"set"`
	Obligation string `json:"obligation,omitempty"`
	Nemesis    string `json:"nemesis,omitempty"`
}

// FaceRef points at one face of a card.
type FaceRef struct {
	Card string `json:"card"`
	Face int    `json:"face"`
}

// Pile is a labelled stack of cards on the scenario table.
type Pile struct {
	Key   string   `json:"key"`
	Label string   `json:"label"`
	Cards []string `json:"cards"`
}

// Start describes the initial table layout of a scenario.
type Start struct {
	Top    map[string]FaceRef `json:"top"`
	InPlay []FaceRef          `json:"inPlay,omitempty"`
}

// Scenario is a hand-curated scenario setup.
type Scenario struct {
	ID          string               `json:"id"`
	Name        string               `json:"name"`
	Pack        string               `json:"pack"`
	VillainSet  string               `json:"villainSet"`
	Piles       []Pile               `json:"piles"`
	Start       map[Difficulty]Start `json:"start"`
	SetAside    []string             `json:"setAside,omitempty"`
	Recommended []string             `json:"recommended,omitempty"` // modular set codes
}

// PackFile is the content of one generated pack file.
//
//nolint:revive // PackFile is the schema name fixed by the plan.
type PackFile struct {
	Code      string     `json:"code"`
	Name      string     `json:"name"`
	Position  int        `json:"position"`
	Cards     []Card     `json:"cards"`
	Sets      []Set      `json:"sets"`
	Heroes    []Hero     `json:"heroes,omitempty"`
	Scenarios []Scenario `json:"scenarios,omitempty"`
}

// PackRef is an index entry locating a pack file.
//
//nolint:revive // PackRef is the schema name fixed by the plan.
type PackRef struct {
	Code     string `json:"code"`
	Name     string `json:"name"`
	File     string `json:"file"`
	Position int    `json:"position"`
	// Localized holds the overrides of the entry per language code, e.g. "fr".
	Localized map[string]Localized `json:"localized,omitempty"`
}

// ScenarioRef is an index entry describing a scenario of the whole range.
type ScenarioRef struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Pack        string   `json:"pack"`
	Image       string   `json:"image"`
	Supported   bool     `json:"supported"`
	Recommended []string `json:"recommended"`
	// Localized holds the overrides of the entry per language code, e.g. "fr".
	Localized map[string]Localized `json:"localized,omitempty"`
}

// SetRef is an index entry describing a set the lobby can offer.
type SetRef struct {
	Code string `json:"code"`
	Name string `json:"name"`
	Pack string `json:"pack"`
	Kind string `json:"kind"`
	// Localized holds the overrides of the entry per language code, e.g. "fr".
	Localized map[string]Localized `json:"localized,omitempty"`
}

// Index lists every pack, scenario and set available for a language.
type Index struct {
	Version   int           `json:"version"` // 1
	Lang      string        `json:"lang"`
	Packs     []PackRef     `json:"packs"`
	Scenarios []ScenarioRef `json:"scenarios"` // the whole range, release order, Supported=false when not curated
	Sets      []SetRef      `json:"sets"`      // modular, standard and expert sets the lobby can offer
}
