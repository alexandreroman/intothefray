package pack

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"strings"
)

// ErrUnknownCard is returned when a code matches no card of the catalog.
var ErrUnknownCard = errors.New("unknown card")

// aliasTarget is what a card code (canonical or alias) resolves to.
type aliasTarget struct {
	code string
	face int
}

// Catalog is the in-memory view of every pack of one language.
// Card, set and hero lookups match codes case-insensitively; scenario IDs
// are matched exactly.
type Catalog struct {
	index     Index
	cards     map[string]Card // by lower-cased canonical code
	aliases   map[string]aliasTarget
	sets      map[string]Set
	scenarios map[string]Scenario
	heroes    map[string]Hero // by lower-cased canonical identity code
}

// Load reads <lang>/index.json, then every pack file it lists.
func Load(fsys fs.FS, lang string) (*Catalog, error) {
	var index Index
	if err := readJSON(fsys, path.Join(lang, "index.json"), &index); err != nil {
		return nil, err
	}

	catalog := &Catalog{
		index:     index,
		cards:     make(map[string]Card),
		aliases:   make(map[string]aliasTarget),
		sets:      make(map[string]Set),
		scenarios: make(map[string]Scenario),
		heroes:    make(map[string]Hero),
	}

	for _, ref := range index.Packs {
		var file PackFile
		if err := readJSON(fsys, path.Join(lang, ref.File), &file); err != nil {
			return nil, err
		}
		if err := catalog.add(file); err != nil {
			return nil, fmt.Errorf("pack %s: %w", ref.Code, err)
		}
	}
	return catalog, nil
}

func readJSON(fsys fs.FS, name string, dst any) error {
	data, err := fs.ReadFile(fsys, name)
	if err != nil {
		return fmt.Errorf("read %s: %w", name, err)
	}
	if err := json.Unmarshal(data, dst); err != nil {
		return fmt.Errorf("decode %s: %w", name, err)
	}
	return nil
}

func (c *Catalog) add(file PackFile) error {
	for _, card := range file.Cards {
		if err := c.addCard(card); err != nil {
			return err
		}
	}
	for _, set := range file.Sets {
		key := strings.ToLower(set.Code)
		if _, taken := c.sets[key]; taken {
			return fmt.Errorf("duplicate set %q", set.Code)
		}
		c.sets[key] = set
	}
	for _, hero := range file.Heroes {
		key := strings.ToLower(hero.Identity)
		if _, taken := c.heroes[key]; taken {
			return fmt.Errorf("duplicate hero %q", hero.Identity)
		}
		c.heroes[key] = hero
	}
	for _, scenario := range file.Scenarios {
		if _, taken := c.scenarios[scenario.ID]; taken {
			return fmt.Errorf("duplicate scenario %q", scenario.ID)
		}
		c.scenarios[scenario.ID] = scenario
	}
	return nil
}

func (c *Catalog) addCard(card Card) error {
	code := strings.ToLower(card.Code)
	if _, taken := c.cards[code]; taken {
		return fmt.Errorf("duplicate card %q", card.Code)
	}
	c.cards[code] = card

	if err := c.addAlias(code, aliasTarget{code: code, face: 0}); err != nil {
		return err
	}
	for _, alias := range card.Aliases {
		alias = strings.ToLower(alias)
		face, err := AliasFace(alias, len(card.Faces))
		if err != nil {
			return err
		}
		if err := c.addAlias(alias, aliasTarget{code: code, face: face}); err != nil {
			return err
		}
	}
	return nil
}

func (c *Catalog) addAlias(alias string, target aliasTarget) error {
	if existing, taken := c.aliases[alias]; taken {
		return fmt.Errorf("code %q is used by cards %s and %s", alias, existing.code, target.code)
	}
	c.aliases[alias] = target
	return nil
}

// AliasFace returns the face named by a lower-case alias made of five digits
// and a letter (a is face 0, b is face 1...), whatever the digits: a reprint
// keeps the face letters of the original card. Any other alias names face 0,
// and so does any alias of a single-face card: its letter then only tells the
// reprint apart from the other cards sharing its number. An alias naming a
// face the card does not have is an error.
func AliasFace(alias string, faceCount int) (int, error) {
	if faceCount == 1 || !isFaceCode(alias) {
		return 0, nil
	}
	face := int(alias[len(alias)-1] - 'a')
	if face >= faceCount {
		return 0, fmt.Errorf("alias %q names face %d, but the card has %d faces", alias, face, faceCount)
	}
	return face, nil
}

// isFaceCode reports whether code matches ^[0-9]{5}[a-z]$.
func isFaceCode(code string) bool {
	if len(code) != 6 {
		return false
	}
	for _, digit := range code[:5] {
		if digit < '0' || digit > '9' {
			return false
		}
	}
	return code[5] >= 'a' && code[5] <= 'z'
}

// Index returns the language index the catalog was loaded from.
func (c *Catalog) Index() Index {
	return c.index
}

// Card resolves a canonical code or any alias. The returned face is the one
// named by a face code, or 0 otherwise.
func (c *Catalog) Card(code string) (card Card, face int, err error) {
	target, ok := c.aliases[strings.ToLower(code)]
	if !ok {
		return Card{}, 0, fmt.Errorf("%w: %s", ErrUnknownCard, code)
	}
	return c.cards[target.code], target.face, nil
}

// Set returns the set with the given code.
func (c *Catalog) Set(code string) (Set, bool) {
	set, ok := c.sets[strings.ToLower(code)]
	return set, ok
}

// Scenario returns the scenario with the given ID.
func (c *Catalog) Scenario(id string) (Scenario, bool) {
	scenario, ok := c.scenarios[id]
	return scenario, ok
}

// HeroByIdentity returns the hero of an identity card, given any alias of it.
func (c *Catalog) HeroByIdentity(code string) (Hero, bool) {
	card, _, err := c.Card(code)
	if err != nil {
		return Hero{}, false
	}
	hero, ok := c.heroes[strings.ToLower(card.Code)]
	return hero, ok
}
