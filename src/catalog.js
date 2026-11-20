/* Standard-Kategorien, Läden und Start-Katalog für den Einkauf */
export const DEFAULT_CATEGORIES = [
  { id: 'obst', name: 'Obst & Gemüse', icon: '🥦', color: '#7bb661' },
  { id: 'brot', name: 'Brot & Backwaren', icon: '🥖', color: '#d9a066' },
  { id: 'milch', name: 'Milch & Käse', icon: '🧀', color: '#f0c850' },
  { id: 'fleisch', name: 'Fleisch & Fisch', icon: '🥩', color: '#d9626a' },
  { id: 'tiefkuehl', name: 'Tiefkühl', icon: '🧊', color: '#6bb7d9' },
  { id: 'nudeln', name: 'Nudeln, Reis & Vorrat', icon: '🍝', color: '#e0a458' },
  { id: 'konserven', name: 'Konserven & Soßen', icon: '🥫', color: '#c76b4a' },
  { id: 'fruehstueck', name: 'Frühstück & Aufstrich', icon: '🥣', color: '#e8b04b' },
  { id: 'suess', name: 'Süßes & Snacks', icon: '🍫', color: '#a0735a' },
  { id: 'getraenke', name: 'Getränke', icon: '🥤', color: '#5a9fd4' },
  { id: 'gewuerze', name: 'Gewürze & Backen', icon: '🧂', color: '#b58fc7' },
  { id: 'drogerie', name: 'Drogerie', icon: '🧴', color: '#e58fb1' },
  { id: 'haushalt', name: 'Haushalt', icon: '🧽', color: '#6cc3b4' },
  { id: 'sonstiges', name: 'Sonstiges', icon: '🛒', color: '#9aa0a6' }
];

const ORDER = DEFAULT_CATEGORIES.map((c) => c.id);

export const DEFAULT_STORES = [
  { id: 'rewe', name: 'REWE', order: ORDER },
  { id: 'lidl', name: 'Lidl', order: ORDER },
  { id: 'penny', name: 'Penny', order: ORDER },
  { id: 'budni', name: 'Budni', order: ['drogerie', 'haushalt', ...ORDER.filter((c) => c !== 'drogerie' && c !== 'haushalt')] }
];

const RAW = {
  obst: 'Äpfel,Bananen,Birnen,Trauben,Orangen,Zitronen,Limetten,Erdbeeren,Himbeeren,Blaubeeren,Kiwi,Mango,Ananas,Melone,Tomaten,Cherrytomaten,Gurke,Paprika,Zucchini,Aubergine,Karotten,Kartoffeln,Süßkartoffeln,Zwiebeln,Knoblauch,Lauchzwiebeln,Lauch,Brokkoli,Blumenkohl,Spinat,Salat,Eisbergsalat,Rucola,Champignons,Pilze,Mais,Ingwer,Avocado,Radieschen,Kohlrabi,Rotkohl,Weißkohl,Petersilie,Basilikum,Schnittlauch,Koriander',
  brot: 'Brot,Brötchen,Toast,Toastbrot,Baguette,Laugenbrezel,Croissant,Vollkornbrot,Wraps,Tortillas,Pita,Burgerbrötchen,Aufbackbrötchen,Knäckebrot',
  milch: 'Milch,Hafermilch,Mandelmilch,Sahne,Kochsahne,Sprühsahne,Schlagsahne,Sahnesteif,Butter,Margarine,Joghurt,Naturjoghurt,Skyr,Quark,Frischkäse,Schmand,Crème fraîche,Eier,Käse,Gouda,Mozzarella,Parmesan,Feta,Reibekäse,Scheibenkäse,Kefir,Buttermilch,Pudding',
  fleisch: 'Hähnchenbrust,Hähnchenschenkel,Hackfleisch,Rinderhack,Schweinefilet,Steak,Bratwurst,Würstchen,Wiener,Schinken,Salami,Aufschnitt,Bacon,Lachs,Thunfisch,Garnelen,Fischstäbchen,Leberwurst,Putenbrust',
  tiefkuehl: 'Pizza,Tiefkühlpizza,Pommes,Rösti,Eis,Speiseeis,Tiefkühlgemüse,Spinat TK,Beeren TK,Gemüsepfanne,Fischfilet TK,Nuggets,Lasagne,Kroketten',
  nudeln: 'Spaghetti,Nudeln,Penne,Fusilli,Reis,Basmatireis,Couscous,Bulgur,Haferflocken,Mehl,Zucker,Linsen,Kichererbsen,Kartoffelpüree,Gnocchi,Instantnudeln,Semmelbrösel',
  konserven: 'Tomaten gehackt,Tomatenmark,Passierte Tomaten,Tomatensoße,Pesto,Mais Dose,Kidneybohnen,Kichererbsen Dose,Thunfisch Dose,Kokosmilch,Ketchup,Senf,Mayonnaise,Sojasoße,Brühe,Gemüsebrühe,Essig,Olivenöl,Sonnenblumenöl,Rapsöl,Gurken,Oliven,Sauerkraut,Suppe',
  fruehstueck: 'Müsli,Cornflakes,Cerealien,Marmelade,Nutella,Honig,Erdnussbutter,Haferbrei,Porridge,Streichwurst,Frühstücksspeck',
  suess: 'Schokolade,Chips,Salzstangen,Gummibärchen,Kekse,Kuchen,Riegel,Müsliriegel,Nüsse,Erdnüsse,Popcorn,Bonbons,Lakritz,Waffeln,Pralinen',
  getraenke: 'Wasser,Mineralwasser,Sprudel,Apfelsaft,Orangensaft,Saft,Cola,Limo,Fanta,Eistee,Bier,Wein,Sekt,Kaffee,Kaffeebohnen,Tee,Kakao,Energy Drink,Schorle,Spezi',
  gewuerze: 'Salz,Pfeffer,Paprikapulver,Curry,Zimt,Oregano,Backpulver,Vanillezucker,Hefe,Speisestärke,Puderzucker,Kakaopulver,Gewürzmischung,Muskat,Chili',
  drogerie: 'Zahnpasta,Zahnbürste,Shampoo,Duschgel,Seife,Deo,Handcreme,Körperlotion,Rasierer,Watte,Wattepads,Taschentücher,Tampons,Binden,Sonnencreme,Haargel,Spülung,Gesichtscreme,Mundwasser,Zahnseide,Pflaster',
  haushalt: 'Toilettenpapier,Küchenrolle,Spülmittel,Spülmaschinentabs,Waschmittel,Weichspüler,Müllbeutel,Gefrierbeutel,Alufolie,Backpapier,Schwämme,Putzmittel,Allzweckreiniger,Glühbirne,Batterien,Kerzen,Streichhölzer,Klarspüler,WC-Reiniger,Frischhaltefolie,Spülmaschinensalz'
};

export const BUILTIN_CATALOG = Object.entries(RAW).flatMap(([categoryId, list]) =>
  list.split(',').map((name) => ({ name, categoryId }))
);

export const DEFAULT_PLACES = ['Kühlschrank', 'Tiefkühler', 'Vorratsregal', 'Müslischrank', 'Putzschrank', 'Badezimmerschrank', 'Spiegelschrank']
  .map((name, i) => ({ id: 'o' + i, name }));
