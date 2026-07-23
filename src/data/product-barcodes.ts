// Mappatura ID prodotto -> Barcode EAN-13 per Open Food Facts
export const PRODUCT_BARCODES: Record<string, string> = {
  // Alternative Vegetali
  'p1': '5411188110835', // Alpro Soya Original
  'p2': '8006040220261', // Valsoia Bevanda di Soia Classica
  'p3': '8004800000000', // Hoplà Panna da Montare (placeholder, barcode reale da verificare)
  'p4': '3273220038890', // Sojasun Soya Cuisine

  // Formaggi (spesso senza barcode specifico su OFF per i DOP, usiamo alcuni esempi)
  // 'p5': Parmigiano Reggiano DOP (varia molto per brand)
  'p6': '8003180000109', // Mozzarella Alta Digeribilità (es. Zymil o similare)
  'p7': '8001280010427', // Mascarpone Accadì (esempio)
  'p8': '8002590000014', // Burro Chiarificato Prealpi (esempio)
  'p9': '8006040225105', // Il Tenero Valsoia

  // Yogurt e Dessert
  'p10': '8001280012346', // Yogurt Alta Digeribilità Zymil Bianco
  // 'p11': Yogurt Colato Val d'Aveto (poco diffuso su OFF)
  // 'p12': Kefir Milk
  'p13': '8006040220810', // Yosoi Bianco Valsoia
  'p14': '5411188115687', // Alpro Soya Greek Style
  'p15': '3273220038920', // Sojasun Bifidus Bianco
  // 'p16': Yogurt Intero Senza Lattosio Inalpi

  // Dolci e Biscotti
  // 'p17': Cornetti Riso Scotti
  // 'p18': Ciambelline Coop
  // 'p19': Biscotto Cacao Conad
  'p20': '8006040222012', // Crema Valsoia Nocciola e Cacao
  // 'p21': Crostatina Riso Scotti

  // Gelati
  'p22': '8711327374828', // Cornetto Classico Senza Lattosio Algida
  'p23': '8711327374835', // Cucciolone Senza Lattosio Algida (esempio)
  'p24': '8006040225006', // Vaschetta Valsoia
  // 'p25': Gelato Squp

  // Piatti Pronti
  // 'p26': Uova Yo! Egg
  'p27': '3273220038951', // Burger Sojasun
};
