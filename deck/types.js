// The three types shown in the deck. Rooms and facts come from the Revit sheets (R4),
// the tour spots (R5) and the plan cuts of each model. Floor areas are not shown:
// slab areas measured from the models include paving and terraces, so they are unreliable.
export const FLOORS = [
  { id: 'basement', ar: 'السرداب',        en: 'Basement' },
  { id: 'ground',   ar: 'الطابق الأرضي',  en: 'Ground floor' },
  { id: 'first',    ar: 'الطابق الأول',   en: 'First floor' },
  { id: 'roof',     ar: 'السطح',          en: 'Roof' },
];
const ALL = ['basement', 'ground', 'first', 'roof'];
// Facts compared across the types (read from the Revit sheets and the plan cuts)
export const FACTS = [
  { id: 'guest',  ar: 'الضيافة',               en: 'Guest rooms' },
  { id: 'suites', ar: 'غرف النوم في الأول',   en: 'First-floor bedrooms' },
  { id: 'pool',   ar: 'المسبح',                en: 'Pool' },
  { id: 'garage', ar: 'الكراج',                en: 'Garage' },
  { id: 'roof',   ar: 'السطح',                 en: 'Roof' },
];

// Interior renders, each shown after the type it belongs to
export const INTERIORS = [
  { type: 't1', src: 'img/int-1.jpg', ar: 'الصالة وجدار الشلال', en: 'Living hall with the waterfall wall' },
  { type: 't1', src: 'img/int-2.jpg', ar: 'الفناء عند الغروب', en: 'The courtyard at dusk' },
  { type: 't1', src: 'img/int-3.jpg', ar: 'الصالة والطعام بقواطع الجوز', en: 'Lounge and dining with walnut screens' },
  { type: 't3', src: 'img/int-4.jpg', ar: 'صالة بارتفاع مضاعف', en: 'Double-height living room' },
  { type: 't3', src: 'img/int-5.jpg', ar: 'صالة المعيشة وشجرة الفناء', en: 'Living room and the courtyard tree' },
];

export const TYPES = [
  {
    id: 't1', rev: 'R5', base: '../data/r5/', ar: 'R5', en: 'R5', floors: ALL,
    headAr: 'بيت حول فناء', headEn: 'A house around a courtyard',
    textAr: 'ضيافة للرجال والنساء حول فناء أخضر في الأرضي، أربع غرف نوم رئيسية في الأول، ومسبح وصالة في السرداب.',
    textEn: "Men's and women's guest rooms around a green courtyard, four master bedrooms above, a pool and lounge below.",
    vr: '../?type=t1',
    facts: { guest: ['رجال ونساء', "Men's and women's"], suites: ['٤ رئيسية', '4 master'], pool: ['في السرداب', 'Basement'], garage: ['٤ سيارات', '4 cars'], roof: ['غرفة وألواح شمسية', 'Solar room, panels'] },
    rooms: {
      basement: [['المسبح', 'Swimming pool'], ['الصالة', 'Lounge'], ['المطبخ', 'Kitchen'], ['غرفة نوم رئيسية', 'Master bedroom'], ['غرفة الخادمة', "Maid's room"], ['غرفة السائق', "Driver's room"], ['الغسيل', 'Laundry']],
      ground: [['ضيافة الرجال والطعام', "Men's guest room and dining"], ['ضيافة النساء', "Women's guest room"], ['الصالة والمطبخ البارد', 'Living and cold kitchen'], ['المطبخ الحار', 'Hot kitchen'], ['غرفة نوم رئيسية', 'Master bedroom'], ['الفناء', 'Courtyard garden'], ['الكراج', 'Garage, 4 cars']],
      first: [['أربع غرف نوم رئيسية', 'Four master bedrooms'], ['غرف ملابس', 'Dressing rooms'], ['منور فوق الفناء', 'Skylight over the courtyard']],
      roof: [['غرفة الطاقة الشمسية والمخزن', 'Solar room and store'], ['ألواح شمسية', 'Solar panels']],
    },
    renders: { basement: 'img/t1-basement.jpg', ground: 'img/t1-ground.jpg', first: 'img/t1-first.jpg', roof: 'img/t1-roof.jpg' },
    exploded: 'img/t1-exploded.jpg',
  },
  {
    id: 't2', rev: 'R3', base: '../data/r3/', ar: 'R3', en: 'R3', floors: ALL, vr: '../?type=t2',
    headAr: 'صالة بارتفاع مضاعف', headEn: 'A double-height living hall',
    textAr: 'ضيافة للرجال والنساء وصالة مفتوحة على الطابق الأول، أربع غرف نوم رئيسية حول فراغ الصالة، ومسبح في السرداب.',
    textEn: "Men's and women's guest rooms and a living hall open to the floor above, four master bedrooms around the void, a basement pool.",
    facts: { guest: ['رجال ونساء', "Men's and women's"], suites: ['٤ رئيسية', '4 master'], pool: ['في السرداب', 'Basement'], garage: ['٣ سيارات', '3 cars'], roof: ['غرفة وألواح شمسية', 'Solar room, panels'] },
    rooms: {
      basement: [['المسبح', 'Swimming pool'], ['الصالة', 'Lounge'], ['المطبخ', 'Kitchen'], ['غرفة نوم', 'Bedroom'], ['غرفة الخادمة', "Maid's room"], ['غرفة السائق', "Driver's room"], ['غرفة الميكانيك', 'Mechanics room']],
      ground: [['ضيافة الرجال والطعام', "Men's guest room and dining"], ['ضيافة النساء', "Women's guest room"], ['الصالة', 'Living room'], ['المطبخ البارد والحار', 'Cold and hot kitchens'], ['غرفة نوم رئيسية', 'Master bedroom'], ['الحديقة', 'Garden court'], ['الكراج', 'Garage, 3 cars']],
      first: [['أربع غرف نوم رئيسية', 'Four master bedrooms'], ['فراغ فوق الصالة', 'Void over the living room']],
      roof: [['غرفة الطاقة الشمسية', 'Solar room'], ['ألواح شمسية', 'Solar panels'], ['مخزن', 'Store']],
    },
    renders: { basement: 'img/t2-basement.jpg', ground: 'img/t2-ground.jpg', first: 'img/t2-first.jpg', roof: 'img/t2-roof.jpg' },
    exploded: 'img/t2-exploded.jpg',
  },
  {
    id: 't3', rev: 'R4', base: '../data/r4/', ar: 'R4', en: 'R4', floors: ALL, vr: '../?type=t3',
    headAr: 'فيلا بمسبح في السرداب', headEn: 'A villa with a basement pool',
    textAr: 'ضيافة منفصلة للرجال والنساء في الأرضي، أربع غرف نوم رئيسية في الأول، ومسبح وصالة في السرداب.',
    textEn: "Separate men's and women's guest rooms on the ground floor, four master suites above, a pool and lounge below.",
    facts: { guest: ['رجال ونساء', "Men's and women's"], suites: ['٤ رئيسية', '4 master'], pool: ['في السرداب', 'Basement'], garage: ['سيارتان', '2 cars'], roof: ['غرفة وألواح شمسية', 'Solar room, panels'] },
    rooms: {
      basement: [['المسبح', 'Swimming pool'], ['الصالة', 'Lounge'], ['المطبخ', 'Kitchen'], ['غرفة نوم رئيسية', 'Master bedroom'], ['غرفة الخادمة', "Maid's room"], ['غرفة السائق', "Driver's room"], ['الغسيل', 'Laundry']],
      ground: [['ضيافة الرجال', "Men's guest room"], ['ضيافة النساء', "Women's guest room"], ['الصالة', 'Living room'], ['غرفة نوم رئيسية', 'Master bedroom'], ['المطبخ البارد والحار', 'Cold and hot kitchens'], ['الحديقة', 'Garden court'], ['الكراج', 'Garage, 2 cars']],
      first: [['أربع غرف نوم رئيسية', 'Four master bedrooms'], ['غرف ملابس', 'Dressing rooms'], ['حمامات', 'Bathrooms']],
      roof: [['غرفة الطاقة الشمسية', 'Solar room'], ['ألواح شمسية', 'Solar panels'], ['مخزن', 'Store']],
    },
    renders: { basement: 'img/t3-basement.jpg', ground: 'img/t3-ground.jpg', first: 'img/t3-first.jpg', roof: 'img/t3-roof.jpg' },
    exploded: 'img/t3-exploded.jpg',
  },
];
