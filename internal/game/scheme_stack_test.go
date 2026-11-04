package game

import (
	"slices"
	"testing"

	"github.com/alexandreroman/intothefray/internal/pack"
)

// Face shapes of the test cards (see Card.Shapes).
var (
	portraitShape  = FaceShape{Size: pack.SizeStd}
	landscapeShape = FaceShape{Size: pack.SizeLand}
	schemeShape    = FaceShape{Size: pack.SizeLand, Scheme: true}
)

// newSchemeTable returns the test table (see newTestTable) with s1, a loose
// encounter card on the table at (x, y), showing face 0 of faces of the given
// shapes, and c9, c10 and c11, loose portrait encounter cards.
func newSchemeTable(x, y int, shapes ...FaceShape) *Table {
	table := newTestTable()
	putOnTable(table, "s1", x, y, 7)
	table.Cards["s1"].Faces = len(shapes)
	table.Cards["s1"].Shapes = shapes
	for i, id := range []string{"c9", "c10", "c11"} {
		putOnTable(table, id, 1000, 1000+200*i, 8+i)
		table.Cards[id].Faces = 1
		table.Cards[id].Shapes = []FaceShape{portraitShape}
	}
	table.NextZ = 20
	return table
}

// attachAll attaches each card of ids, in order, to target.
func attachAll(t *testing.T, table *Table, target string, ids ...string) {
	t.Helper()
	for _, id := range ids {
		mustApply(t, table, Action{Kind: ActAttach, Card: id, Target: target})
	}
}

// checkPlaces fails when the cards ids do not lie at the points want, in
// order.
func checkPlaces(t *testing.T, table *Table, ids []string, want []Point) {
	t.Helper()
	for i, id := range ids {
		checkAt(t, table, id, want[i].X, want[i].Y)
	}
}

func TestTuckUnderASchemeCentresTheFirstCard(t *testing.T) {
	// A portrait card, 112 x 157, centred on a landscape scheme, 157 x 112,
	// lies (157-112)/2 = 22 to the right of it and (112-157)/2 = -22 below it.
	// Each later card lies attachOffsetX to the right of and attachOffsetY
	// below the previous one.
	tests := []struct {
		name   string
		shapes []FaceShape // of the faces of s1
		face   int         // the face s1 shows
		tucked []string
		want   []Point
	}{
		{"main scheme, one card", []FaceShape{schemeShape, schemeShape}, 1, []string{"c9"}, []Point{{422, 278}}},
		{
			"main scheme, three cards",
			[]FaceShape{schemeShape, schemeShape},
			1,
			[]string{"c9", "c10", "c11"},
			[]Point{{422, 278}, {432, 298}, {442, 318}},
		},
		{"side scheme, one card", []FaceShape{schemeShape}, 0, []string{"c9"}, []Point{{422, 278}}},
		{
			"side scheme, three cards",
			[]FaceShape{schemeShape},
			0,
			[]string{"c9", "c10", "c11"},
			[]Point{{422, 278}, {432, 298}, {442, 318}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := newSchemeTable(400, 300, tt.shapes...)
			table.Cards["s1"].Face = tt.face

			attachAll(t, table, "s1", tt.tucked...)

			checkAt(t, table, "s1", 400, 300)
			checkPlaces(t, table, tt.tucked, tt.want)
			// The last tucked card lowest, s1 on top.
			bottomUp := slices.Clone(tt.tucked)
			slices.Reverse(bottomUp)
			checkZOrder(t, table, append(bottomUp, "s1")...)
			checkUniqueZ(t, table)
			checkIntegrity(t, table)
		})
	}
}

func TestTuckUnderACardShowingNoSchemeKeepsTheOffsets(t *testing.T) {
	tests := []struct {
		name  string
		setUp func(s1 *Card)
	}{
		{"portrait card", func(*Card) {}},
		{"landscape card", func(s1 *Card) { s1.Shapes = []FaceShape{landscapeShape} }},
		{"card without shapes", func(s1 *Card) { s1.Shapes = nil }},
		{"face-down scheme", func(s1 *Card) {
			s1.Shapes = []FaceShape{schemeShape}
			s1.FaceDown = true
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := newSchemeTable(400, 300, portraitShape)
			tt.setUp(table.Cards["s1"])

			attachAll(t, table, "s1", "c9", "c10", "c11")

			checkStack(t, table, "s1", "c9", "c10", "c11")
			checkAt(t, table, "c9", 410, 320)
			checkIntegrity(t, table)
		})
	}
}

func TestCentredCardTakesTheBoxItIsDrawnWith(t *testing.T) {
	tests := []struct {
		name  string
		setUp func(s1, c9 *Card)
		want  Point // where c9 lies
	}{
		{"portrait card", func(_, _ *Card) {}, Point{422, 278}},
		{"card without shapes, a portrait one", func(_, c9 *Card) { c9.Shapes = nil }, Point{422, 278}},
		{"landscape card", func(_, c9 *Card) { c9.Shapes = []FaceShape{schemeShape} }, Point{400, 300}},
		{"face-down landscape card, a portrait back", func(_, c9 *Card) {
			c9.Shapes = []FaceShape{schemeShape}
			c9.FaceDown = true
		}, Point{422, 278}},
		// 157 x 224: (157-157)/2 = 0 to the right, (112-224)/2 = -56 below.
		{"double-size portrait card", func(_, c9 *Card) {
			c9.Shapes = []FaceShape{{Size: pack.SizeDoubleStd}}
		}, Point{400, 244}},
		// The scheme, revealed on a deck, is drawn turned a quarter, 112 x 157.
		{"scheme revealed on a deck", func(s1, _ *Card) { s1.OnPile = PileEncounter }, Point{400, 300}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := newSchemeTable(400, 300, schemeShape)
			tt.setUp(table.Cards["s1"], table.Cards["c9"])

			attachAll(t, table, "s1", "c9", "c10")

			checkAt(t, table, "c9", tt.want.X, tt.want.Y)
			checkAt(t, table, "c10", tt.want.X+attachOffsetX, tt.want.Y+attachOffsetY)
		})
	}
}

func TestCentredCardStaysOnTheTable(t *testing.T) {
	tests := []struct {
		name   string
		x, y   int // where s1 lies
		shape  FaceShape
		tucked []string
		want   []Point
	}{
		// The portrait card would lie 22 above the top edge of the table.
		{"top edge", 400, 0, portraitShape, []string{"c9", "c10", "c11"}, []Point{{422, 0}, {432, 20}, {442, 40}}},
		// A double-size landscape card, 224 x 157, would lie 33 left of the
		// left edge and 22 above the top edge.
		{"left edge", 0, 0, FaceShape{Size: pack.SizeDoubleLand}, []string{"c9", "c10"}, []Point{{0, 0}, {10, 20}}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := newSchemeTable(tt.x, tt.y, schemeShape)
			table.Cards["c9"].Shapes = []FaceShape{tt.shape}

			attachAll(t, table, "s1", tt.tucked...)

			checkPlaces(t, table, tt.tucked, tt.want)
			checkIntegrity(t, table)
		})
	}
}

func TestFlipPlacesTheStackAgain(t *testing.T) {
	tests := []struct {
		name  string
		setUp func(s1, c9 *Card)
		flip  Action
		want  []Point // where c9 and c10 lie after the flip
	}{
		{
			"scheme turns face down",
			func(_, _ *Card) {},
			Action{Kind: ActFlip, Card: "s1", Face: 0, FaceDown: new(true)},
			[]Point{{410, 320}, {420, 340}},
		},
		{
			"scheme turns face up",
			func(s1, _ *Card) { s1.FaceDown = true },
			Action{Kind: ActFlip, Card: "s1", Face: 0, FaceDown: new(false)},
			[]Point{{422, 278}, {432, 298}},
		},
		{
			"main card turns to a scheme face",
			func(s1, _ *Card) {
				s1.Faces = 2
				s1.Shapes = []FaceShape{portraitShape, schemeShape}
			},
			Action{Kind: ActFlip, Card: "s1", Face: 1, FaceDown: new(false)},
			[]Point{{422, 278}, {432, 298}},
		},
		{
			"first tucked card turns to a landscape face",
			func(_, c9 *Card) {
				c9.Faces = 2
				c9.Face = 1
				c9.Shapes = []FaceShape{schemeShape, portraitShape}
			},
			Action{Kind: ActFlip, Card: "c9", Face: 0, FaceDown: new(false)},
			[]Point{{400, 300}, {410, 320}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			table := newSchemeTable(400, 300, schemeShape)
			tt.setUp(table.Cards["s1"], table.Cards["c9"])
			attachAll(t, table, "s1", "c9", "c10")
			zs := []int{table.Cards["s1"].Z, table.Cards["c9"].Z, table.Cards["c10"].Z}

			mustApply(t, table, tt.flip)

			checkAt(t, table, "s1", 400, 300)
			checkPlaces(t, table, []string{"c9", "c10"}, tt.want)
			got := []int{table.Cards["s1"].Z, table.Cards["c9"].Z, table.Cards["c10"].Z}
			if got[0] != zs[0] || got[1] != zs[1] || got[2] != zs[2] {
				t.Errorf("Zs of s1, c9, c10 = %v, want %v: a flip keeps them", got, zs)
			}
			checkIntegrity(t, table)
		})
	}
}

func TestChooseStagePlacesTheStackAgain(t *testing.T) {
	tests := []struct {
		name   string
		choose Action
	}{
		{"other face of the current card", Action{Kind: ActChooseStage, Stage: "scheme", Card: "s1", Face: 1}},
		{"another card", Action{Kind: ActChooseStage, Stage: "scheme", Card: "s2", Face: 0}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// s1 shows a portrait face that is no scheme, its other face is a
			// scheme; s2, waiting in the stage zone, is a scheme.
			table := newSchemeTable(400, 300, portraitShape, schemeShape)
			table.Cards["s2"] = &Card{
				ID: "s2", Owner: NoOwner, Home: PileEncounter, Zone: ZoneStage, Faces: 1,
				Shapes: []FaceShape{schemeShape},
			}
			table.Stages = []*Stage{
				{Key: "scheme", Label: "Main scheme", Current: "s1", Cards: []string{"s1", "s2"}},
			}
			attachAll(t, table, "s1", "c9", "c10")
			checkPlaces(t, table, []string{"c9", "c10"}, []Point{{410, 320}, {420, 340}})

			mustApply(t, table, tt.choose)

			checkPlaces(t, table, []string{"c9", "c10"}, []Point{{422, 278}, {432, 298}})
			checkIntegrity(t, table)
		})
	}
}
