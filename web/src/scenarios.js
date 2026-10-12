// Geführte Aufgaben. Jede Aufgabe legt Objekte an (wie in der Eingabezeile), blendet ein Blender-Modell ein
// und führt in Schritten durch die Lösung. select: [a] oder [a, b] öffnet die Analyse bzw. die Lagebeziehung.
// view: Blickrichtung (Mathe-Koordinaten x1|x2|x3), Abstand und Ziel.

export const SCENARIOS = [
  {
    id: 'pyramide',
    kicker: 'Körper · Ebene · Winkel',
    title: 'Die Glaspyramide',
    desc: 'Eckpunkte, Seitenfläche als Ebene, Neigungswinkel, Volumen und Abstand – eine typische Abituraufgabe.',
    range: 6,
    model: 'Szene_Pyramide',
    objects: [
      ['A(3|-3|0)', '#7c9cff'], ['B(3|3|0)', '#7c9cff'], ['C(-3|3|0)', '#7c9cff'], ['D(-3|-3|0)', '#7c9cff'], ['S(0|0|4,5)', '#ff7a59'],
      ['E = Ebene(B, C, S)', '#5ad1c8'], ['G: x3 = 0', '#9fb2c8'], ['M(0|0|0)', '#ffd166'], ['h = Gerade(M, S)', '#ffd166'],
    ],
    steps: [
      {
        title: 'Die Pyramide',
        text: 'Eine gläserne Pyramide hat eine quadratische Grundfläche ABCD (Kantenlänge 6 m) und die Spitze S. 1 LE = 1 m. Klicke Punkte an und lies ihre Koordinaten ab.',
        show: ['A', 'B', 'C', 'D', 'S'], select: ['S'], view: { dir: [1.2, 0.7, 0.75], dist: 17, target: [0, 0, 1.8] },
      },
      {
        title: 'Länge einer Seitenkante',
        text: 'Wie lang ist die Kante AS? Der Abstand zweier Punkte ist der Betrag ihres Verbindungsvektors.',
        show: ['A', 'B', 'C', 'D', 'S'], select: ['A', 'S'], view: { dir: [1.1, -0.4, 0.5], dist: 15, target: [1.5, -1.5, 2.2] },
      },
      {
        title: 'Die Seitenfläche BCS als Ebene',
        text: 'Spannvektoren BC und BS, Normalenvektor mit dem Kreuzprodukt, dann Koordinatenform.',
        show: ['A', 'B', 'C', 'D', 'S', 'E'], select: ['E'], view: { dir: [-0.4, 1.4, 0.7], dist: 18, target: [0, 1.5, 2] },
      },
      {
        title: 'Neigungswinkel der Seitenfläche',
        text: 'Der Winkel zwischen Seitenfläche E und Grundebene G ist der Winkel zwischen ihren Normalenvektoren. Die Schnittgerade ist die Kante BC.',
        show: ['B', 'C', 'S', 'E', 'G'], select: ['E', 'G'], view: { dir: [1.25, 0.95, 0.55], dist: 19, target: [0, 1.5, 1.5] },
      },
      {
        title: 'Höhe und Volumen',
        text: 'Die Höhe ist der Abstand der Spitze S vom Mittelpunkt M der Grundfläche: h = 4,5. Volumen: V = ⅓ · G · h = ⅓ · 36 · 4,5 = 54 (m³).',
        show: ['A', 'B', 'C', 'D', 'S', 'M', 'h'], select: ['M', 'S'], view: { dir: [1.3, 0.5, 0.45], dist: 16, target: [0, 0, 2.2] },
      },
      {
        title: 'Abstand des Mittelpunkts zur Seitenfläche',
        text: 'Wie weit ist M von der Glasfläche BCS entfernt? Hessesche Normalform – der Lotfußpunkt liegt auf der Seitenfläche.',
        show: ['B', 'C', 'S', 'M', 'E'], select: ['M', 'E'], view: { dir: [0.9, 1.2, 0.55], dist: 15, target: [0, 1.5, 1.5] },
      },
    ],
  },
  {
    id: 'flug',
    kicker: 'Geraden · windschief · Abstand',
    title: 'Zwei Flugbahnen',
    desc: 'Zwei Flugzeuge auf geradlinigen Bahnen: Schneiden sich die Bahnen? Wie nah kommen sich die Flugzeuge wirklich?',
    range: 8,
    model: 'Flugzeuge',
    flight: { lines: ['f1', 'f2'], planes: ['Flugzeug_A', 'Flugzeug_B'], tMax: 8, unit: 'km', time: 'min' },
    objects: [
      ['f1: x = (-7|-4|3) + t*(2|1|0,2)', '#ff7a59'],
      ['f2: x = (6|-6|4,5) + t*(-1|2|0)', '#4db3ff'],
    ],
    steps: [
      {
        title: 'Radar meldet zwei Flugzeuge',
        text: 'Flugzeug A fliegt auf f1, Flugzeug B auf f2 (1 LE = 1 km, t in Minuten). Mit ▶ fliegen beide los – der Regler unten ist die Zeit.',
        show: ['f1', 'f2'], select: ['f1'], view: { dir: [1.2, 0.6, 0.9], dist: 30, target: [0, -1, 3.5] },
      },
      {
        title: 'Kreuzen sich die Bahnen?',
        text: 'Lagebeziehung zweier Geraden: nicht kollinear, das LGS hat keine Lösung → windschief. Der kleinste Abstand der Bahnen ist das gemeinsame Lot.',
        show: ['f1', 'f2'], select: ['f1', 'f2'], view: { dir: [0.5, 1.4, 0.5], dist: 26, target: [0, -2, 4] },
      },
      {
        title: 'Sind sie gleichzeitig dort?',
        text: '',      // filled in live (distance at equal times)
        live: 'flight',
        show: ['f1', 'f2'], select: ['f1', 'f2'], view: { dir: [1.0, 0.8, 1.2], dist: 28, target: [0, -2, 4] },
      },
    ],
  },
  {
    id: 'schatten',
    kicker: 'Gerade ∩ Ebene · Durchstoßpunkt',
    title: 'Schatten am Hang',
    desc: 'Ein Sendemast wirft seinen Schatten über die Wiese bis auf einen Hang. Wo liegt die Schattenspitze?',
    range: 6,
    model: 'Szene_Schatten',
    shadow: true,
    objects: [
      ['F(3|2|0)', '#9fb2c8'], ['S(3|2|6)', '#ff7a59'], ['v = (-1|-1|-1)', '#ffd166'],
      ['l: x = (3|2|6) + t*(-1|-1|-1)', '#ffd166'], ['B: x3 = 0', '#7fbf6a'], ['H: x1 + x3 = -1', '#b9a98c'],
      ["S'(-2|-3|1)", '#ffd166'], ['K(-1|-2|0)', '#ffd166'],
    ],
    steps: [
      {
        title: 'Der Mast',
        text: 'Ein 6 m hoher Sendemast steht senkrecht im Punkt F auf der Wiese (Ebene B: x₃ = 0). Hinter ihm steigt ein Hang an (Ebene H). 1 LE = 1 m.',
        show: ['F', 'S'], select: ['S'], view: { dir: [1.3, 1.0, 0.6], dist: 18, target: [0.5, 0, 2.5] },
      },
      {
        title: 'Der Sonnenstrahl',
        text: 'Das Sonnenlicht fällt in Richtung v = (−1|−1|−1). Der Strahl durch die Mastspitze S ist die Gerade l.',
        show: ['F', 'S', 'v', 'l'], select: ['l'], view: { dir: [1.2, -0.5, 0.7], dist: 19, target: [0, -1, 2.5] },
      },
      {
        title: 'Trifft der Strahl die Wiese?',
        text: 'Durchstoßpunkt von l mit B: x₃ = 0 liegt bei x₁ = −3 – dort ist aber schon der Hang (er beginnt bei x₁ = −1). Der Strahl trifft also vorher den Hang.',
        show: ['F', 'S', 'l', 'B', 'H'], select: ['l', 'B'], view: { dir: [0.3, -1.4, 0.6], dist: 20, target: [-1, -1, 1.5] },
      },
      {
        title: 'Die Schattenspitze im Hang',
        text: 'Durchstoßpunkt von l mit dem Hang H: x₁ + x₃ = −1 liefert die Schattenspitze S′.',
        show: ['F', 'S', 'l', 'H', "S'"], select: ['l', 'H'], view: { dir: [1.0, -1.0, 0.8], dist: 18, target: [-1, -1, 1.5] },
      },
      {
        title: 'Der Schatten knickt',
        text: 'Auf der Wiese läuft der Schatten von F in Richtung (−1|−1|0) bis zur Hangkante x₁ = −1, also bis K(−1|−2|0); dann den Hang hinauf bis S′. Länge: |FK| + |KS′| = √32 + √3 ≈ 7,39 m.',
        show: ['F', 'S', "S'", 'K', 'H'], select: ['K', "S'"], view: { dir: [1.1, 0.4, 1.3], dist: 17, target: [0, -0.5, 0.8] },
      },
    ],
  },
];
