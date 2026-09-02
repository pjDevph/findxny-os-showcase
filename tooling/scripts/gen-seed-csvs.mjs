// Generates import-ready seed CSVs for the Mugthemug admin importers, from the
// data in mugthemug_seed_import_report. Outputs to seed/:
//   - ingredients-seed.csv  → Inventory ▸ Ingredients ▸ Import/Export
//   - recipes-seed.csv      → Products ▸ Recipes CSV
//   - inventory-seed.csv    → Inventory ▸ Stock ▸ Import CSV
//
// All costs / stock / thresholds are 0 placeholders (per the report) and recipe
// quantities are DRAFT — confirm real values before trusting food-cost %.
//
// Run: node tooling/scripts/gen-seed-csvs.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const BRANCH = "Angono, Rizal";

/* ── Ingredients: [name, stockUnit] (141) ─────────────────────────────── */
const INGREDIENTS = [
  ["Espresso Blend Beans","gram"],["Arabica Blend Beans","gram"],["Barako Blend Beans","gram"],
  ["Benguet Blend Beans","gram"],["Kalinga Blend Beans","gram"],["Robusta Quezon Beans","gram"],
  ["Liberica Indonesia Beans","gram"],["Arabica Mt. Matutum Beans","gram"],["Excelsa Amadeo Beans","gram"],
  ["Ground Coffee Filter","pcs"],["Fresh Milk","ml"],["Oat Milk","ml"],["Soy Milk","ml"],["Non-Dairy Milk","ml"],
  ["Creamer","gram"],["Whipped Cream","gram"],["Condensed Milk","ml"],["Sea Salt Cream","ml"],
  ["Chocolate Sauce","ml"],["Caramel Sauce","ml"],["Sugar Syrup","ml"],["Honey","ml"],["Lemon Juice","ml"],
  ["Soda Water","ml"],["Ice","gram"],["Hot Cup","pcs"],["Cold Cup","pcs"],["Cup Lid","pcs"],
  ["Straw","pcs"],["Sealing Film","pcs"],["Napkin","pcs"],["Coffee Jelly","gram"],["Tapioca Pearls","gram"],
  ["Chocolate Chips","gram"],["Oreo Crumbs","gram"],["Cheesecake Bits","gram"],["Graham Crumbs","gram"],
  ["Mango Puree","ml"],["Strawberry Puree","ml"],["Blueberry Syrup","ml"],["Green Apple Syrup","ml"],
  ["Passion Fruit Syrup","ml"],["Lychee Syrup","ml"],["Lemon Syrup","ml"],["Cucumber","gram"],["Ginger","gram"],
  ["Brown Sugar","gram"],["White Sugar","gram"],["Cinnamon Powder","gram"],["Matcha Powder","gram"],
  ["Milk Tea Base Powder","gram"],["Black Tea Leaves","gram"],["Taro Powder","gram"],["Wintermelon Syrup","ml"],
  ["Okinawa Syrup","ml"],["Dark Chocolate Powder","gram"],["Black Forest Syrup","ml"],["Frappe Base Powder","gram"],
  ["Blueberry Frappe Powder","gram"],["Caramel Frappe Syrup","ml"],["Caramel Toffee Syrup","ml"],
  ["Chocolate Chip Frappe Powder","gram"],["Cheesecake Frappe Powder","gram"],["Cookies and Cream Powder","gram"],
  ["Dark Mocha Powder","gram"],["White Rabbit Powder","gram"],["Java Chip Powder","gram"],
  ["Roasted Almond Syrup","ml"],["Hazelnut Syrup","ml"],["French Vanilla Syrup","ml"],["Dalgona Coffee Powder","gram"],
  ["Rice","gram"],["Garlic","gram"],["Onion","gram"],["Tomato","gram"],["Egg","pcs"],["Cooking Oil","ml"],
  ["Butter","gram"],["Salt","gram"],["Black Pepper","gram"],["Soy Sauce","ml"],["Vinegar","ml"],["Fish Sauce","ml"],
  ["Bagoong","gram"],["Tamarind Mix","gram"],["Coconut Milk","ml"],["Peanut Sauce","gram"],["Caldereta Sauce","gram"],
  ["Tomato Sauce","gram"],["Mayonnaise","gram"],["Cheese Sauce","gram"],["Sour Cream","gram"],
  ["Mozzarella Cheese","gram"],["Cheddar Cheese","gram"],["Parmesan Cheese","gram"],["Blue Cheese","gram"],
  ["Pizza Dough","pcs"],["Pizza Sauce","gram"],["Pepperoni","gram"],["Ham","gram"],["Pineapple Tidbits","gram"],
  ["Bacon","gram"],["French Fries","gram"],["Nacho Chips","gram"],["Tortilla Wrapper","pcs"],["Lumpia Wrapper","pcs"],
  ["Flour","gram"],["Bread Crumbs","gram"],["Corn Kernels","gram"],["Mango","gram"],["Green Chili","gram"],
  ["String Beans","gram"],["Eggplant","gram"],["Pechay","gram"],["Cabbage","gram"],["Carrot","gram"],["Potato","gram"],
  ["Mashed Potato Mix","gram"],["Truffle Oil","ml"],["Pork Belly","gram"],["Pork Leg","gram"],["Pork Sisig Meat","gram"],
  ["Pork BBQ Cut","gram"],["Chicken Fillet","gram"],["Chicken BBQ Cut","gram"],["Hungarian Sausage","gram"],
  ["Beef Tapa","gram"],["Beef Ribs","gram"],["Beef Caldereta Cut","gram"],["Beef Shank","gram"],["Bangus","gram"],
  ["Salmon Steak","gram"],["Squid","gram"],["Calamari Rings","gram"],["Shrimp","gram"],["Pancit Canton Noodles","gram"],
  ["Pancit Bihon Noodles","gram"],["Chicken Stock","ml"],["Beef Stock","ml"],["Coconut Water","ml"],["Marshmallow Stick","pcs"],
];

/* ── Products: [name, sellingUnit] (92) ───────────────────────────────── */
const cup = "cup", serving = "serving", plate = "plate", addon = "add-on";
const PRODUCTS = [
  ["Blueberry Frappe",cup],["Caramel Frappe",cup],["Caramel Toffee Frappe",cup],["Chocolate Chip Frappe",cup],
  ["Cheesecake Frappe",cup],["Coffee Jelly Frappe",cup],["Cookies and Cream Frappe",cup],["Dark Mocha Frappe",cup],
  ["Strawberry Frappe",cup],["White Rabbit Frappe",cup],["Mango Graham Frappe",cup],["Java Chip Frappe",cup],
  ["Roasted Almond Latte",cup],["Hazelnut Espresso Latte",cup],["French Vanilla Espresso Latte",cup],
  ["Sea Salt Caramel Latte",cup],["Ginger Ale",cup],["Honey Lemon Cucumber",cup],["Dalgona Coffee",cup],["Caramel Macchiato",cup],
  ["Dark Chocolate Milktea",cup],["Black Forest Milktea",cup],["Wintermelon Milktea",cup],["Taro Milktea",cup],["Okinawa Milktea",cup],
  ["Hot Caramel Macchiato",cup],["Hot Spanish Latte",cup],["Hot French Vanilla",cup],["Hot Chocolate",cup],["Hot Matcha",cup],
  ["Oat Milk Add-on",addon],["Non Dairy Add-on",addon],["Soy Milk Add-on",addon],
  ["Blueberry Soda",cup],["Green Apple Soda",cup],["Passion Fruit Soda",cup],["Lychee Soda",cup],["Lemon Soda",cup],
  ["Dirty Matcha",cup],["Strawberry Matcha Frappe",cup],["Matcha Milktea",cup],["Oreo Matcha Latte",cup],
  ["Almuerzo Blend",cup],["Barako Blend",cup],["Arabica Blend",cup],["Benguet Blend",cup],["Kalinga Blend",cup],
  ["Espresso Blend",cup],["Hazelnut Flavor Coffee",cup],["Turkish Cinnamon Coffee",cup],
  ["Robusta Quezon Prov",cup],["Liberica Indonesia",cup],["Arabica Mt. Matutum",cup],["Excelsa Amadeo",cup],
  ["Cajun Corn",serving],["Sizzling Sisig",serving],["Kilawin na Liempo",serving],["Lumpiang Shanghai",serving],
  ["Beef Loaded Nachos",serving],["Ensaladang Mangga",serving],["Fried Calamari",serving],["Cheesy Bacon Fries",serving],["Dynamite",serving],
  ["Boneless Chicksilog",plate],["Tapsilog",plate],["Lechon Silog",plate],["Bangsilog",plate],["Hungarian Silog",plate],
  ["Pinyadobo",serving],["Crispy Pork Binagoongan",serving],["Gising Gising",serving],["Beef Caldereta",serving],
  ["Crispy Kare Kare",serving],["Bangus Ala Pobre",serving],["Crispy Pata",serving],
  ["Pancit Canton",serving],["Pancit Bihon",serving],["Mixed Pancit",serving],
  ["Margherita Pizza",serving],["Pizza Supreme",serving],["Quattro Formaggi Pizza",serving],["Pepperoni Pizza",serving],["Hawaiian Pizza",serving],
  ["Pork Barbecue",serving],["Honey Salmon Steak",serving],["Grilled Squid",serving],["Mashed Potatoes",serving],["Prime Beef Ribs",serving],["Chicken Barbecue",serving],
  ["Sinigang na Baboy",serving],["Beef Bulalo",serving],["Chicken Binakol",serving],
];

/* ── Recipe bases (qty/unit are DRAFT, from the report) ───────────────── */
const COLD = [["Cold Cup",1,"pcs"],["Cup Lid",1,"pcs"],["Straw",1,"pcs"]];
const FRAPPE = [...COLD,["Ice",180,"gram"],["Fresh Milk",120,"ml"],["Frappe Base Powder",25,"gram"],["Whipped Cream",20,"gram"]];
const MILKTEA = [...COLD,["Black Tea Leaves",5,"gram"],["Milk Tea Base Powder",25,"gram"],["Fresh Milk",120,"ml"],["Sugar Syrup",15,"ml"],["Sealing Film",1,"pcs"]];
const ICED_ESP = [...COLD,["Espresso Blend Beans",18,"gram"],["Fresh Milk",180,"ml"]];
const SODA = [...COLD,["Soda Water",180,"ml"],["Ice",120,"gram"]];
const MATCHA = [...COLD,["Matcha Powder",8,"gram"],["Fresh Milk",180,"ml"],["Sugar Syrup",15,"ml"]];
const SAVORY = [["Cooking Oil",20,"ml"],["Salt",3,"gram"],["Black Pepper",1,"gram"]];
const SILOG = [...SAVORY,["Rice",180,"gram"],["Egg",1,"pcs"],["Garlic",10,"gram"]];
const PIZZA = [...SAVORY,["Pizza Dough",1,"pcs"],["Pizza Sauce",80,"gram"],["Mozzarella Cheese",120,"gram"]];
const brew = (bean, extra = []) => [["Hot Cup",1,"pcs"],[bean,18,"gram"],...extra];
const hotEsp = (extra = []) => [["Hot Cup",1,"pcs"],["Espresso Blend Beans",18,"gram"],["Fresh Milk",180,"ml"],...extra];

const RECIPES = {
  "Blueberry Frappe":[...FRAPPE,["Blueberry Frappe Powder",20,"gram"]],
  "Caramel Frappe":[...FRAPPE,["Caramel Frappe Syrup",25,"ml"]],
  "Caramel Toffee Frappe":[...FRAPPE,["Caramel Toffee Syrup",25,"ml"]],
  "Chocolate Chip Frappe":[...FRAPPE,["Chocolate Chip Frappe Powder",25,"gram"]],
  "Cheesecake Frappe":[...FRAPPE,["Cheesecake Frappe Powder",25,"gram"]],
  "Coffee Jelly Frappe":[...FRAPPE,["Coffee Jelly",50,"gram"]],
  "Cookies and Cream Frappe":[...FRAPPE,["Cookies and Cream Powder",25,"gram"]],
  "Dark Mocha Frappe":[...FRAPPE,["Dark Mocha Powder",25,"gram"]],
  "Strawberry Frappe":[...FRAPPE,["Strawberry Puree",30,"ml"]],
  "White Rabbit Frappe":[...FRAPPE,["White Rabbit Powder",25,"gram"]],
  "Mango Graham Frappe":[...FRAPPE,["Mango Puree",30,"ml"],["Graham Crumbs",10,"gram"]],
  "Java Chip Frappe":[...FRAPPE,["Java Chip Powder",25,"gram"],["Chocolate Chips",10,"gram"]],
  "Roasted Almond Latte":[...ICED_ESP,["Roasted Almond Syrup",20,"ml"]],
  "Hazelnut Espresso Latte":[...ICED_ESP,["Hazelnut Syrup",20,"ml"]],
  "French Vanilla Espresso Latte":[...ICED_ESP,["French Vanilla Syrup",20,"ml"]],
  "Sea Salt Caramel Latte":[...ICED_ESP,["Caramel Sauce",20,"ml"],["Sea Salt Cream",40,"ml"]],
  "Ginger Ale":[...COLD,["Ginger",30,"gram"],["Honey",20,"ml"],["Lemon Juice",10,"ml"],["Sugar Syrup",15,"ml"]],
  "Honey Lemon Cucumber":[...COLD,["Cucumber",40,"gram"],["Honey",20,"ml"],["Lemon Juice",15,"ml"],["Ice",120,"gram"]],
  "Dalgona Coffee":[...ICED_ESP,["Dalgona Coffee Powder",20,"gram"]],
  "Caramel Macchiato":[...ICED_ESP,["Caramel Sauce",20,"ml"]],
  "Dark Chocolate Milktea":[...MILKTEA,["Dark Chocolate Powder",15,"gram"]],
  "Black Forest Milktea":[...MILKTEA,["Black Forest Syrup",20,"ml"]],
  "Wintermelon Milktea":[...MILKTEA,["Wintermelon Syrup",20,"ml"]],
  "Taro Milktea":[...MILKTEA,["Taro Powder",20,"gram"]],
  "Okinawa Milktea":[...MILKTEA,["Okinawa Syrup",20,"ml"]],
  "Hot Caramel Macchiato":hotEsp([["Caramel Sauce",20,"ml"]]),
  "Hot Spanish Latte":hotEsp(),
  "Hot French Vanilla":hotEsp([["French Vanilla Syrup",20,"ml"]]),
  "Hot Chocolate":hotEsp([["Dark Chocolate Powder",20,"gram"]]),
  "Hot Matcha":[["Hot Cup",1,"pcs"],["Matcha Powder",8,"gram"],["Fresh Milk",180,"ml"],["Sugar Syrup",15,"ml"]],
  "Oat Milk Add-on":[["Oat Milk",120,"ml"]],
  "Non Dairy Add-on":[["Non-Dairy Milk",120,"ml"]],
  "Soy Milk Add-on":[["Soy Milk",120,"ml"]],
  "Blueberry Soda":[...SODA,["Blueberry Syrup",25,"ml"]],
  "Green Apple Soda":[...SODA,["Green Apple Syrup",25,"ml"]],
  "Passion Fruit Soda":[...SODA,["Passion Fruit Syrup",25,"ml"]],
  "Lychee Soda":[...SODA,["Lychee Syrup",25,"ml"]],
  "Lemon Soda":[...SODA,["Lemon Syrup",25,"ml"]],
  "Dirty Matcha":[...MATCHA,["Espresso Blend Beans",18,"gram"]],
  "Strawberry Matcha Frappe":[...MATCHA,["Strawberry Puree",25,"ml"]],
  "Matcha Milktea":[...MATCHA],
  "Oreo Matcha Latte":[...MATCHA,["Oreo Crumbs",15,"gram"]],
  "Almuerzo Blend":brew("Espresso Blend Beans"),
  "Barako Blend":brew("Barako Blend Beans"),
  "Arabica Blend":brew("Arabica Blend Beans"),
  "Benguet Blend":brew("Benguet Blend Beans"),
  "Kalinga Blend":brew("Kalinga Blend Beans"),
  "Espresso Blend":brew("Espresso Blend Beans"),
  "Hazelnut Flavor Coffee":brew("Espresso Blend Beans",[["Hazelnut Syrup",20,"ml"]]),
  "Turkish Cinnamon Coffee":brew("Espresso Blend Beans",[["Cinnamon Powder",2,"gram"]]),
  "Robusta Quezon Prov":brew("Robusta Quezon Beans"),
  "Liberica Indonesia":brew("Liberica Indonesia Beans"),
  "Arabica Mt. Matutum":brew("Arabica Mt. Matutum Beans"),
  "Excelsa Amadeo":brew("Excelsa Amadeo Beans"),
  "Cajun Corn":[...SAVORY,["Corn Kernels",180,"gram"],["Butter",20,"gram"]],
  "Sizzling Sisig":[...SAVORY,["Pork Sisig Meat",180,"gram"],["Onion",30,"gram"],["Mayonnaise",20,"gram"]],
  "Kilawin na Liempo":[...SAVORY,["Pork Belly",180,"gram"],["Vinegar",40,"ml"],["Onion",30,"gram"]],
  "Lumpiang Shanghai":[...SAVORY],
  "Beef Loaded Nachos":[...SAVORY,["Nacho Chips",80,"gram"],["Beef Tapa",100,"gram"],["Cheese Sauce",40,"gram"],["Sour Cream",20,"gram"]],
  "Ensaladang Mangga":[...SAVORY,["Mango",180,"gram"],["Tomato",40,"gram"],["Onion",30,"gram"],["Fish Sauce",15,"ml"]],
  "Fried Calamari":[...SAVORY,["Calamari Rings",180,"gram"],["Flour",40,"gram"]],
  "Cheesy Bacon Fries":[...SAVORY,["French Fries",180,"gram"],["Bacon",30,"gram"],["Cheese Sauce",40,"gram"]],
  "Dynamite":[...SAVORY,["Green Chili",5,"pcs"],["Cheddar Cheese",50,"gram"],["Lumpia Wrapper",5,"pcs"]],
  "Boneless Chicksilog":[...SILOG,["Chicken Fillet",150,"gram"]],
  "Tapsilog":[...SILOG,["Beef Tapa",150,"gram"]],
  "Lechon Silog":[...SILOG,["Pork Belly",150,"gram"]],
  "Bangsilog":[...SILOG,["Bangus",150,"gram"]],
  "Hungarian Silog":[...SILOG,["Hungarian Sausage",150,"gram"]],
  "Pinyadobo":[...SAVORY,["Pork Belly",250,"gram"],["Soy Sauce",30,"ml"],["Vinegar",30,"ml"],["Pineapple Tidbits",80,"gram"]],
  "Crispy Pork Binagoongan":[...SAVORY,["Pork Belly",250,"gram"],["Bagoong",50,"gram"]],
  "Gising Gising":[...SAVORY,["String Beans",180,"gram"],["Coconut Milk",120,"ml"],["Pork Belly",80,"gram"]],
  "Beef Caldereta":[...SAVORY,["Beef Caldereta Cut",250,"gram"],["Caldereta Sauce",120,"gram"],["Potato",80,"gram"],["Carrot",60,"gram"]],
  "Crispy Kare Kare":[...SAVORY,["Pork Belly",250,"gram"],["Peanut Sauce",100,"gram"],["Bagoong",20,"gram"],["Eggplant",60,"gram"],["String Beans",60,"gram"]],
  "Bangus Ala Pobre":[...SAVORY,["Bangus",250,"gram"],["Garlic",25,"gram"],["Soy Sauce",30,"ml"]],
  "Crispy Pata":[...SAVORY,["Pork Leg",500,"gram"],["Soy Sauce",40,"ml"]],
  "Pancit Canton":[...SAVORY,["Pancit Canton Noodles",200,"gram"],["Carrot",40,"gram"],["Cabbage",60,"gram"],["Chicken Stock",120,"ml"]],
  "Pancit Bihon":[...SAVORY,["Pancit Bihon Noodles",200,"gram"],["Carrot",40,"gram"],["Cabbage",60,"gram"],["Chicken Stock",120,"ml"]],
  "Mixed Pancit":[...SAVORY,["Pancit Canton Noodles",120,"gram"],["Pancit Bihon Noodles",120,"gram"],["Carrot",40,"gram"],["Cabbage",60,"gram"]],
  "Margherita Pizza":[...PIZZA],
  "Pizza Supreme":[...PIZZA,["Pepperoni",40,"gram"],["Ham",40,"gram"],["Onion",30,"gram"]],
  "Quattro Formaggi Pizza":[...PIZZA,["Cheddar Cheese",40,"gram"],["Parmesan Cheese",30,"gram"],["Blue Cheese",30,"gram"]],
  "Pepperoni Pizza":[...PIZZA,["Pepperoni",60,"gram"]],
  "Hawaiian Pizza":[...PIZZA,["Ham",60,"gram"],["Pineapple Tidbits",60,"gram"]],
  "Pork Barbecue":[...SAVORY,["Pork BBQ Cut",180,"gram"],["Soy Sauce",30,"ml"],["Sugar Syrup",20,"ml"]],
  "Honey Salmon Steak":[...SAVORY,["Salmon Steak",180,"gram"],["Honey",25,"ml"]],
  "Grilled Squid":[...SAVORY,["Squid",220,"gram"],["Soy Sauce",20,"ml"]],
  "Mashed Potatoes":[...SAVORY,["Mashed Potato Mix",160,"gram"],["Butter",20,"gram"],["Truffle Oil",5,"ml"]],
  "Prime Beef Ribs":[...SAVORY,["Beef Ribs",300,"gram"],["Soy Sauce",30,"ml"]],
  "Chicken Barbecue":[...SAVORY,["Chicken BBQ Cut",180,"gram"],["Soy Sauce",30,"ml"],["Sugar Syrup",20,"ml"]],
  "Sinigang na Baboy":[...SAVORY,["Pork Belly",220,"gram"],["Tamarind Mix",20,"gram"],["Pechay",60,"gram"],["Eggplant",60,"gram"]],
  "Beef Bulalo":[...SAVORY,["Beef Shank",300,"gram"],["Beef Stock",200,"ml"],["Cabbage",80,"gram"]],
  "Chicken Binakol":[...SAVORY,["Chicken Fillet",220,"gram"],["Coconut Water",250,"ml"],["Ginger",20,"gram"]],
};

/* ── Emit ─────────────────────────────────────────────────────────────── */
const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCSV = (header, rows) => [header.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n") + "\n";

const ingredientRows = INGREDIENTS.map(([name, unit]) => [name, unit, 0, 0, 0]);
const inventoryRows  = PRODUCTS.map(([name, unit]) => [BRANCH, name, 0, unit, 0, 0]);
const recipeRows = [];
for (const [product, lines] of Object.entries(RECIPES))
  for (const [ingredient, qty, unit] of lines) recipeRows.push([product, ingredient, qty, unit]);

mkdirSync("seed", { recursive: true });
writeFileSync("seed/ingredients-seed.csv", toCSV(["name","unit","cost","stock","threshold"], ingredientRows));
writeFileSync("seed/recipes-seed.csv", toCSV(["product","ingredient","qty","unit"], recipeRows));
writeFileSync("seed/inventory-seed.csv", toCSV(["branch","product","qty","unit","threshold","cost"], inventoryRows));

// Validate recipe ingredient references resolve to a known ingredient.
const ingNames = new Set(INGREDIENTS.map(([n]) => n.toLowerCase()));
const unknown = [...new Set(recipeRows.map((r) => r[1]).filter((n) => !ingNames.has(n.toLowerCase())))];

console.log(`ingredients-seed.csv : ${ingredientRows.length} rows`);
console.log(`recipes-seed.csv     : ${recipeRows.length} rows (${Object.keys(RECIPES).length} products)`);
console.log(`inventory-seed.csv   : ${inventoryRows.length} rows`);
if (unknown.length) console.log(`⚠ recipe ingredients not in ingredient list: ${unknown.join(", ")}`);
else console.log("✓ all recipe ingredients resolve to the ingredient list");
