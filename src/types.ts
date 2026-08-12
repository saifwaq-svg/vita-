export interface Category {
  id: string;
  name: string;
}

export interface LinkedMaterial {
  inventoryName: string; // اسم المادة بالـ Inventory
  consumeQty: number;    // كمية الاستهلاك مع كل عملة خصم (مثال: 1)
  salesRatio: number;    // عدد المبيعات المطلوبة لتنفيذ الخصم (مثال: 1 = كل 1 بيع، 4 = كل 4 مبيعات)
}

export interface Product {
  id: string;
  cat_id: string;
  name: string;
  price: number;
  img: string;
  linked_inv?: string; // Legacy: Linked raw material in inventory
  linked_pkg?: string; // Legacy: Linked packaging/accessory in inventory
  pkg_ratio?: number;  // Legacy: Usage ratio
  linked_materials?: LinkedMaterial[]; // Multi-inventory items linkage array
}

export interface Employee {
  pin: string;
  name: string;
}

export interface InventoryItem {
  name: string;
  total: number;
  sold: number;
  alert_limit: number;
}

export interface Sale {
  id: number;
  date: string;
  total: number;
  note: string;
  discount: number;
  emp: string;
  details: string; // Comma-separated or bullet list of bought items
  businessDay?: string; // Business Day date string (YYYY-MM-DD)
}

export interface DailyArchive {
  date: string;
  total: number;
}

// Outstanding Default Data for Vita Cashier
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "cat_1", name: "القهوة الحارة" },
  { id: "cat_2", name: "المشروبات الباردة" },
  { id: "cat_3", name: "الحلويات والمخبوزات" },
  { id: "cat_4", name: "الشاي والمشروبات الخاصة" }
];

export const DEFAULT_PRODUCTS: Product[] = [
  { 
    id: "item_1", 
    cat_id: "cat_1", 
    name: "إسبيرسو مزدوج", 
    price: 3000, 
    img: "https://images.unsplash.com/photo-1510707577719-ee7c223a3594?w=400&auto=format&fit=crop&q=60", 
    linked_materials: [
      { inventoryName: "بن إسبيرسو فريش", consumeQty: 18, salesRatio: 1 },
      { inventoryName: "فنجان ورقي صغير", consumeQty: 1, salesRatio: 1 }
    ]
  },
  { 
    id: "item_2", 
    cat_id: "cat_1", 
    name: "أمريكانو حار", 
    price: 4000, 
    img: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&auto=format&fit=crop&q=60", 
    linked_materials: [
      { inventoryName: "بن إسبيرسو فريش", consumeQty: 18, salesRatio: 1 },
      { inventoryName: "كوب ورقي وسط", consumeQty: 1, salesRatio: 1 }
    ]
  },
  { id: "item_3", cat_id: "cat_1", name: "كابتشينو كلاسيك", price: 4500, img: "https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&auto=format&fit=crop&q=60", linked_inv: "بن إسبيرسو فريش", linked_pkg: "كوب ورقي وسط", pkg_ratio: 1 },
  { 
    id: "item_4", 
    cat_id: "cat_2", 
    name: "سبانش لاتيه بارد", 
    price: 5500, 
    img: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&auto=format&fit=crop&q=60", 
    linked_materials: [
      { inventoryName: "كوب بلاستيك كبير", consumeQty: 1, salesRatio: 1 },
      { inventoryName: "غطاء بلاستيكي", consumeQty: 1, salesRatio: 1 },
      { inventoryName: "شفاطة عصير", consumeQty: 1, salesRatio: 1 },
      { inventoryName: "حليب طازج", consumeQty: 1, salesRatio: 1 },
      { inventoryName: "حاملة أكواب", consumeQty: 1, salesRatio: 4 }
    ]
  },
  { id: "item_5", cat_id: "cat_2", name: "زعفران لاتيه بارد", price: 6000, img: "https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&auto=format&fit=crop&q=60", linked_inv: "شراب الزعفران", linked_pkg: "كوب بلاستيك كبير", pkg_ratio: 1 },
  { id: "item_6", cat_id: "cat_3", name: "كوكيز شوكولاتة", price: 3000, img: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400&auto=format&fit=crop&q=60", linked_inv: "كوكيز شوكولاتة جاهز", linked_pkg: "ظرف مخبوزات ورقي", pkg_ratio: 1 },
  { id: "item_7", cat_id: "cat_3", name: "كيكة الزعفران اللذيذة", price: 5000, img: "https://images.unsplash.com/photo-1588195538326-c5b1e9f80a1b?w=400&auto=format&fit=crop&q=60", linked_inv: "كيكة الزعفران", linked_pkg: "علبة حلى صغيرة", pkg_ratio: 1 },
  { id: "item_8", cat_id: "cat_4", name: "شاي خوخ بارد منعش", price: 4500, img: "https://images.unsplash.com/photo-1497534446932-c925b458314e?w=400&auto=format&fit=crop&q=60", linked_inv: "مركز الخوخ", linked_pkg: "كوب بلاستيك كبير", pkg_ratio: 1 }
];

export const DEFAULT_INVENTORY: InventoryItem[] = [
  { name: "بن إسبيرسو فريش", total: 5000, sold: 120, alert_limit: 500 },
  { name: "حليب طازج", total: 50, sold: 12, alert_limit: 8 },
  { name: "شراب الزعفران", total: 10, sold: 2, alert_limit: 2 },
  { name: "مركز الخوخ", total: 15, sold: 3, alert_limit: 3 },
  { name: "كوب ورقي وسط", total: 1000, sold: 80, alert_limit: 100 },
  { name: "كوب بلاستيك كبير", total: 800, sold: 95, alert_limit: 80 },
  { name: "غطاء بلاستيكي", total: 1000, sold: 90, alert_limit: 100 },
  { name: "شفاطة عصير", total: 1500, sold: 110, alert_limit: 150 },
  { name: "حاملة أكواب", total: 300, sold: 25, alert_limit: 30 },
  { name: "فنجان ورقي صغير", total: 1200, sold: 40, alert_limit: 120 },
  { name: "كوكيز شوكولاتة جاهز", total: 150, sold: 15, alert_limit: 20 },
  { name: "كيكة الزعفران", total: 80, sold: 8, alert_limit: 10 },
  { name: "ظرف مخبوزات ورقي", total: 500, sold: 15, alert_limit: 50 },
  { name: "علبة حلى صغيرة", total: 400, sold: 8, alert_limit: 40 }
];

export const DEFAULT_EMPLOYEES: Employee[] = [
  { pin: "1111", name: "أحمد جاسم" },
  { pin: "2222", name: "سارة علي" },
  { pin: "3333", name: "حسين محمد" }
];
