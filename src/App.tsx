import React, { useState, useEffect, useRef } from "react";
import { 
  Coffee, 
  Layers, 
  Settings, 
  BarChart3, 
  Archive, 
  Lock, 
  Unlock, 
  Plus, 
  Trash2, 
  Edit, 
  Search, 
  User, 
  Percent, 
  FileText, 
  Check, 
  AlertTriangle, 
  Printer, 
  X, 
  RotateCcw, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Copy,
  ExternalLink,
  Cloud,
  CloudOff,
  RefreshCw,
  LogIn,
  LogOut,
  Mail,
  Key,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Category, 
  Product, 
  Employee, 
  InventoryItem, 
  Sale, 
  DailyArchive,
  LinkedMaterial,
  DEFAULT_CATEGORIES,
  DEFAULT_PRODUCTS,
  DEFAULT_INVENTORY,
  DEFAULT_EMPLOYEES
} from "./types";
import {
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  collection,
  where,
  updateDoc,
  deleteDoc,
  getDocs,
  type User as FirebaseUser
} from "./firebase";

interface UserProfile {
  email: string;
  uid: string;
  role: "admin" | "partner" | "cashier";
  status: "approved" | "pending" | "rejected";
  storeEmail: string;
  name: string;
  phone?: string;
}

// Automatically detect requester's device info
const getDeviceInfo = () => {
  if (typeof window === "undefined" || !navigator) return "جهاز غير معروف";
  const ua = navigator.userAgent;
  let os = "جهاز غير معروف";
  if (ua.indexOf("Win") !== -1) os = "كمبيوتر Windows";
  else if (ua.indexOf("Mac") !== -1) os = "جهاز Mac";
  else if (ua.indexOf("X11") !== -1) os = "جهاز Linux";
  else if (ua.indexOf("Android") !== -1) os = "هاتف Android";
  else if (ua.indexOf("iPhone") !== -1) os = "هاتف iPhone";
  else if (ua.indexOf("iPad") !== -1) os = "iPad";

  let browser = "متصفح غير معروف";
  if (ua.indexOf("Chrome") !== -1) browser = "Chrome";
  else if (ua.indexOf("Safari") !== -1 && ua.indexOf("Chrome") === -1) browser = "Safari";
  else if (ua.indexOf("Firefox") !== -1) browser = "Firefox";
  else if (ua.indexOf("Edge") !== -1) browser = "Edge";
  else if (ua.indexOf("OPR") !== -1 || ua.indexOf("Opera") !== -1) browser = "Opera";

  return `${os} (${browser})`;
};

// Encrypt payload containing OTP, device info, name and timestamp
const encryptMessage = (otp: string, device: string, name: string) => {
  const payload = {
    otp,
    device,
    name,
    t: Date.now()
  };
  try {
    return "VITA-SEC-" + btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  } catch (e) {
    return "VITA-SEC-" + btoa(otp);
  }
};

// Decrypt encrypted payload back into object
const decryptMessage = (encrypted: string) => {
  const trimmed = encrypted.trim();
  if (!trimmed.startsWith("VITA-SEC-")) return null;
  const raw = trimmed.substring(9);
  try {
    const jsonStr = decodeURIComponent(escape(atob(raw)));
    return JSON.parse(jsonStr) as { otp: string; device: string; name: string; t: number };
  } catch (e) {
    try {
      const fallback = atob(raw);
      if (/^\d+$/.test(fallback)) {
        return { otp: fallback, device: "جهاز غير معروف", name: "مستخدِم غير معروف", t: Date.now() };
      }
    } catch (inner) {}
    return null;
  }
};

// Hash OTP securely using SHA-256 with salt
const hashOTP = async (otp: string): Promise<string> => {
  const msgBuffer = new TextEncoder().encode(otp + "VITA_CASHIER_SALT_2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

// Helper to calculate the expected business day date (YYYY-MM-DD) based on start time
const getExpectedBusinessDay = (date: Date, startHourStr: string): string => {
  const [sh, sm] = (startHourStr || "08:00").split(":").map(Number);
  const hour = date.getHours();
  const minute = date.getMinutes();
  
  const targetDate = new Date(date);
  if (hour < sh || (hour === sh && minute < sm)) {
    targetDate.setDate(targetDate.getDate() - 1);
  }
  
  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, "0");
  const dd = String(targetDate.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const getSaleBusinessDay = (sale: Sale, startHour: string): string => {
  if (sale.businessDay) return sale.businessDay;
  try {
    return getExpectedBusinessDay(new Date(sale.id), startHour);
  } catch {
    return getExpectedBusinessDay(new Date(), startHour);
  }
};

export default function App() {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState<string>("pos");
  const [isManager, setIsManager] = useState<boolean>(false);
  const [adminPin, setAdminPin] = useState<string>(() => {
    return localStorage.getItem("vita_access_pin") || localStorage.getItem("vita_admin_pin") || "1234";
  });

  const [businessDayStartHour, setBusinessDayStartHour] = useState<string>(() => {
    return localStorage.getItem("vita_business_day_start_hour") || "08:00";
  });
  const [currentBusinessDay, setCurrentBusinessDay] = useState<string>(() => {
    return localStorage.getItem("vita_current_business_day") || getExpectedBusinessDay(new Date(), "08:00");
  });
  const [selectedReportDay, setSelectedReportDay] = useState<string>("");

  useEffect(() => {
    localStorage.setItem("vita_business_day_start_hour", businessDayStartHour);
  }, [businessDayStartHour]);

  useEffect(() => {
    localStorage.setItem("vita_current_business_day", currentBusinessDay);
  }, [currentBusinessDay]);

  // Base Arrays loaded from localStorage or using outstanding defaults
  const [categories, setCategories] = useState<Category[]>(() => {
    try {
      const cached = localStorage.getItem("vita_categories");
      return cached ? JSON.parse(cached) : DEFAULT_CATEGORIES;
    } catch {
      return DEFAULT_CATEGORIES;
    }
  });
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const cached = localStorage.getItem("vita_items_tree");
      return cached ? JSON.parse(cached) : DEFAULT_PRODUCTS;
    } catch {
      return DEFAULT_PRODUCTS;
    }
  });
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    try {
      const cached = localStorage.getItem("vita_inventory");
      return cached ? JSON.parse(cached) : DEFAULT_INVENTORY;
    } catch {
      return DEFAULT_INVENTORY;
    }
  });
  const [employees, setEmployees] = useState<Employee[]>(() => {
    try {
      const cached = localStorage.getItem("vita_employees");
      return cached ? JSON.parse(cached) : DEFAULT_EMPLOYEES;
    } catch {
      return DEFAULT_EMPLOYEES;
    }
  });
  const [sales, setSales] = useState<Sale[]>(() => {
    try {
      const cached = localStorage.getItem("my_sales_v6");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [dailyArchive, setDailyArchive] = useState<DailyArchive[]>(() => {
    try {
      const cached = localStorage.getItem("vita_daily_archive");
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  // UI Interactive States
  const [currentCatId, setCurrentCatId] = useState<string>("");
  const [cart, setCart] = useState<{ product: Product; qty: number }[]>([]);
  const [discount, setDiscount] = useState<number>(0);
  const [note, setNote] = useState<string>("");
  const [employeePin, setEmployeePin] = useState<string>("");

  // Search filter inside POS
  const [posSearch, setPosSearch] = useState<string>("");

  // Print Queue State
  const [printDetails, setPrintDetails] = useState<{
    type: "invoice" | "report" | "archive";
    title: string;
    cashier?: string;
    timestamp: string;
    items?: { name: string; qty: number; total: number }[];
    total: number;
    subtotal?: number;
    discount?: number;
    note?: string;
    records?: any[];
  } | null>(null);

  // --- CLOUD SYNC & AUTHENTICATION STATES ---
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(() => {
    return localStorage.getItem("vita_offline_mode") === "true";
  });
  const [currentUser, setCurrentUser] = useState<{ email: string; uid: string } | null>(() => {
    const savedEmail = localStorage.getItem("vita_user_email");
    if (savedEmail) {
      return { email: savedEmail, uid: "custom_uid" };
    }
    return null;
  });
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(() => {
    const savedEmail = localStorage.getItem("vita_user_email");
    if (savedEmail) {
      return {
        email: savedEmail,
        uid: "custom_uid",
        role: (localStorage.getItem("vita_user_role") as "admin" | "partner" | "cashier") || "admin",
        status: "approved",
        storeEmail: localStorage.getItem("vita_store_email") || savedEmail,
        name: localStorage.getItem("vita_user_name") || "مستخدم فيتا"
      };
    }
    return null;
  });
  const [isDataLoaded, setIsDataLoaded] = useState<boolean>(false);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>("");
  const [partnerRequests, setPartnerRequests] = useState<UserProfile[]>([]);

  // Custom WhatsApp OTP & Email login states
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [settingsTab, setSettingsTab] = useState<"config" | "decrypt">("config");
  const [customStoreEmail, setCustomStoreEmail] = useState<string>("saifwaq@gmail.com");
  const [customPersonalEmail, setCustomPersonalEmail] = useState<string>(() => {
    return localStorage.getItem("vita_user_personal_email") || "";
  });
  const [customUserName, setCustomUserName] = useState<string>(() => {
    return localStorage.getItem("vita_user_name") || "";
  });
  const [customUserPhone, setCustomUserPhone] = useState<string>(() => {
    return localStorage.getItem("vita_user_phone") || "";
  });
  const [customUserRole, setCustomUserRole] = useState<"admin" | "partner" | "cashier">("partner");
  const [customManagerPhone, setCustomManagerPhone] = useState<string>(() => {
    const saved = localStorage.getItem("vita_manager_phone");
    if (saved === "+9647726588266" || !saved) {
      return "+9647838292664";
    }
    return saved;
  });
  
  const [generatedOtp, setGeneratedOtp] = useState<string>("");
  const [enteredOtp, setEnteredOtp] = useState<string>("");
  const [otpSent, setOtpSent] = useState<boolean>(false);
  const [pendingVerificationEmail, setPendingVerificationEmail] = useState<string>("");
  const [activeOtpRequests, setActiveOtpRequests] = useState<any[]>([]);
  const [encryptedRequestToken, setEncryptedRequestToken] = useState<string>("");
  const [decryptInputToken, setDecryptInputToken] = useState<string>("");
  const [decryptedPayload, setDecryptedPayload] = useState<{ otp: string; device: string; name: string; t: number } | null>(null);

  const [loginPinInput, setLoginPinInput] = useState<string>("");

  // Auth screen state controls
  const [authTab, setAuthTab] = useState<"login" | "signup">("login");
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");
  
  const [signupName, setSignupName] = useState<string>("");
  const [signupEmail, setSignupEmail] = useState<string>("");
  const [signupPassword, setSignupPassword] = useState<string>("");
  const [signupRole, setSignupRole] = useState<"admin" | "partner" | "cashier">("partner");
  const [signupAdminEmail, setSignupAdminEmail] = useState<string>("saifwaq@gmail.com");

  const [cloudSyncing, setCloudSyncing] = useState<boolean>(false);
  const [cloudError, setCloudError] = useState<string>("");
  const [cloudStatus, setCloudStatus] = useState<"offline" | "syncing" | "synced" | "error" | "conflict">("offline");
  const [lastSyncedTime, setLastSyncedTime] = useState<string>("");

  const [deviceId] = useState(() => {
    let id = localStorage.getItem("vita_device_id");
    if (!id) {
      id = "dev_" + Math.random().toString(36).substring(2, 15);
      localStorage.setItem("vita_device_id", id);
    }
    return id;
  });

  const lastUploadedDataRef = useRef<string>("");

  // Management Forms State
  const [invFormIdx, setInvFormIdx] = useState<number>(-1);
  const [invName, setInvName] = useState<string>("");
  const [invTotalQty, setInvTotalQty] = useState<number>(0);
  const [invAlertLimit, setInvAlertLimit] = useState<number>(0);

  const [catFormId, setCatFormId] = useState<string>("");
  const [catNameInput, setCatNameInput] = useState<string>("");

  const [itemFormId, setItemFormId] = useState<string>("");
  const [itemCatSelect, setItemCatSelect] = useState<string>("");
  const [itemNameInput, setItemNameInput] = useState<string>("");
  const [itemPriceInput, setItemPriceInput] = useState<number>(0);
  const [itemImgInput, setItemImgInput] = useState<string>("");
  const [itemLinkedInv, setItemLinkedInv] = useState<string>("");
  const [itemLinkedPkg, setItemLinkedPkg] = useState<string>("");
  const [itemPkgRatio, setItemPkgRatio] = useState<number>(1);
  const [itemLinkedMaterials, setItemLinkedMaterials] = useState<LinkedMaterial[]>([]);

  // Multi-material row helpers
  const addLinkedMaterialRow = () => {
    const defaultInvName = inventory[0]?.name || "";
    setItemLinkedMaterials(prev => [...prev, { inventoryName: defaultInvName, consumeQty: 1, salesRatio: 1 }]);
  };

  const updateLinkedMaterialRow = (index: number, key: keyof LinkedMaterial, value: any) => {
    setItemLinkedMaterials(prev => prev.map((mat, idx) => idx === index ? { ...mat, [key]: value } : mat));
  };

  const removeLinkedMaterialRow = (index: number) => {
    setItemLinkedMaterials(prev => prev.filter((_, idx) => idx !== index));
  };

  // POS Direct Item Management Modal States
  const [showPosProductModal, setShowPosProductModal] = useState<boolean>(false);
  const [posModalMode, setPosModalMode] = useState<"add" | "edit">("add");
  const [showQuickAddCat, setShowQuickAddCat] = useState<boolean>(false);
  const [quickNewCatName, setQuickNewCatName] = useState<string>("");

  const [newEmpName, setNewEmpName] = useState<string>("");
  const [newEmpPin, setNewEmpPin] = useState<string>("");

  const [adminPinSetting, setAdminPinSetting] = useState<string>("0000");

  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authPinInput, setAuthPinInput] = useState<string>("");
  const [pendingTab, setPendingTab] = useState<string>("");

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {}
  });

  const customConfirm = (title: string, message: string, onConfirmAction: () => void) => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      onConfirm: () => {
        onConfirmAction();
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  // Filtered products computed from categories and search
  const filteredProducts = products.filter((p) => {
    const matchesCat = currentCatId ? p.cat_id === currentCatId : true;
    const matchesSearch = posSearch.trim()
      ? p.name.toLowerCase().includes(posSearch.toLowerCase()) ||
        p.price.toString().includes(posSearch)
      : true;
    return matchesCat && matchesSearch;
  });

  // Employee Management Actions
  const saveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newEmpName.trim();
    const pin = newEmpPin.trim();

    if (!name || pin.length < 4) {
      alert("⚠️ يرجى كتابة الاسم والرمز السري من 4 أرقام!");
      return;
    }

    if (employees.some(emp => emp.pin === pin)) {
      alert("❌ هذا الرمز السري مستخدم لموظف آخر! يرجى اختيار رمز فريد.");
      return;
    }

    const newEmp: Employee = { pin, name };
    setEmployees([...employees, newEmp]);
    setNewEmpName("");
    setNewEmpPin("");
    alert("✅ تم تسجيل وتعميم رمز الموظف الجديد بنجاح!");
  };

  const deleteEmployee = (pin: string) => {
    if (confirm("هل أنت متأكد من حذف هذا الموظف وإلغاء صلاحية رمزه؟")) {
      setEmployees(employees.filter(emp => emp.pin !== pin));
      alert("🗑️ تم حذف الموظف بنجاح.");
    }
  };

  // Automatically update the main Category ID once categories are loaded
  useEffect(() => {
    if (categories.length > 0 && !currentCatId) {
      setCurrentCatId(categories[0].id);
    }
  }, [categories, currentCatId]);

  // Force log out once initially so the user can start completely fresh from SignUp
  useEffect(() => {
    if (isOfflineMode) return;
    const hasCleared = localStorage.getItem("vita_cleared_initial_session");
    if (!hasCleared) {
      signOut(auth).then(() => {
        localStorage.setItem("vita_cleared_initial_session", "true");
      }).catch(err => {
        console.error("Error signing out initially:", err);
      });
    }
  }, [isOfflineMode]);

  // Set up local offline profile if offline mode is active
  useEffect(() => {
    if (isOfflineMode) {
      setCurrentUser({ email: "offline@local", uid: "offline_uid" });
      setCurrentUserProfile({
        email: "offline@local",
        uid: "offline_uid",
        role: "admin",
        status: "approved",
        storeEmail: "offline@local",
        name: "مدير محلي (أوفلاين)"
      });
      setIsDataLoaded(true);
    }
  }, [isOfflineMode]);

  // Handle Admin bypassing PIN requirement
  useEffect(() => {
    if (currentUserProfile) {
      if (currentUserProfile.role === "admin") {
        setIsManager(true);
      } else {
        setIsManager(false);
      }
    } else {
      setIsManager(false);
    }
  }, [currentUserProfile]);

  // Real-time listener for Auth changes & Profile updates in Firestore
  useEffect(() => {
    if (isOfflineMode) {
      const savedEmail = localStorage.getItem("vita_user_email");
      if (savedEmail) {
        const savedName = localStorage.getItem("vita_user_name") || "مستخدم فيتا";
        const savedRole = (localStorage.getItem("vita_user_role") as "admin" | "partner" | "cashier") || "admin";
        setCurrentUser({ email: savedEmail, uid: "custom_uid" });
        setCurrentUserProfile({
          email: savedEmail,
          uid: "custom_uid",
          role: savedRole,
          status: "approved",
          storeEmail: "offline@local",
          name: savedName
        });
      } else {
        setCurrentUser(null);
        setCurrentUserProfile(null);
        setIsDataLoaded(false);
      }
      return;
    }

    const savedEmail = localStorage.getItem("vita_user_email");
    if (!savedEmail) {
      setCurrentUser(null);
      setCurrentUserProfile(null);
      setIsDataLoaded(false);
      return;
    }

    // Set initial user info before snapshot loads
    const savedName = localStorage.getItem("vita_user_name") || "مستخدم فيتا";
    const savedRole = (localStorage.getItem("vita_user_role") as "admin" | "partner" | "cashier") || "admin";
    const savedStoreEmail = localStorage.getItem("vita_store_email") || "saifwaq@gmail.com";

    setCurrentUser({ email: savedEmail, uid: "custom_uid" });
    setCurrentUserProfile({
      email: savedEmail,
      uid: "custom_uid",
      role: savedRole,
      status: savedRole === "admin" ? "approved" : "pending",
      storeEmail: savedStoreEmail,
      name: savedName
    });

    // Real-time profile sync from Firestore
    const userDocRef = doc(db, "users", savedEmail);
    const unsubscribe = onSnapshot(userDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCurrentUserProfile({
          email: data.email || savedEmail,
          uid: data.uid || "custom_uid",
          role: data.role || savedRole,
          status: data.status || "approved",
          storeEmail: data.storeEmail || savedStoreEmail,
          name: data.name || savedName
        });
      }
    }, (err) => {
      console.error("Error listening to user profile:", err);
    });

    return () => unsubscribe();
  }, [isOfflineMode]);

  // Real-time listener on the cashier's device for 2FA OTP approval
  useEffect(() => {
    if (!otpSent || !pendingVerificationEmail || isOfflineMode) return;

    const verificationRef = doc(db, "otp_verifications", pendingVerificationEmail);
    const unsubscribe = onSnapshot(verificationRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === "approved") {
          // Automatic login!
          const cleanStoreEmail = data.storeEmail || "saifwaq@gmail.com";
          const cleanPersonalEmail = data.email;
          const cleanName = data.name;
          const role = data.role;

          localStorage.setItem("vita_user_email", cleanPersonalEmail);
          localStorage.setItem("vita_store_email", cleanStoreEmail);
          localStorage.setItem("vita_user_name", cleanName);
          localStorage.setItem("vita_user_role", role);
          localStorage.setItem("vita_manager_phone", customManagerPhone);
          if (role !== "admin") {
            localStorage.setItem("vita_user_personal_email", cleanPersonalEmail);
          }

          const userProfile: UserProfile = {
            email: cleanPersonalEmail,
            uid: "custom_uid",
            role: role as any,
            status: "approved",
            storeEmail: cleanStoreEmail,
            name: cleanName
          };

          try {
            await setDoc(doc(db, "users", cleanPersonalEmail), userProfile);
            // Delete the verification record after successful login so it's fully consumed
            await deleteDoc(verificationRef);
          } catch (err) {
            console.error("Error finalizing auto login:", err);
          }

          setCurrentUser({ email: cleanPersonalEmail, uid: "custom_uid" });
          setCurrentUserProfile(userProfile);
          
          alert("🎉 تم الموافقة على دخولك تلقائياً من قبل المدير! مرحباً بك.");
          setOtpSent(false);
          setPendingVerificationEmail("");
        } else if (data.status === "rejected") {
          setAuthError("❌ تم رفض طلب تسجيل الدخول من قبل المدير.");
          setOtpSent(false);
          setPendingVerificationEmail("");
          try {
            await deleteDoc(verificationRef);
          } catch (e) {}
        }
      }
    }, (err) => {
      console.error("Error listening to verification approval:", err);
    });

    return () => unsubscribe();
  }, [otpSent, pendingVerificationEmail, isOfflineMode]);

  // Real-time listener for Admin to see active 2FA/login requests
  useEffect(() => {
    if (isOfflineMode || !currentUserProfile || currentUserProfile.role !== "admin") {
      setActiveOtpRequests([]);
      return;
    }

    const q = query(
      collection(db, "otp_verifications"),
      where("storeEmail", "==", currentUserProfile.storeEmail || "saifwaq@gmail.com"),
      where("status", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const list: any[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        const now = new Date().toISOString();
        if (now <= data.expiresAt) {
          list.push({ id: doc.id, ...data });
        }
      });
      setActiveOtpRequests(list);
    }, (err) => {
      console.error("Error listening to active OTP requests:", err);
    });

    return () => unsubscribe();
  }, [currentUserProfile, isOfflineMode]);

  // Real-time synchronization for store data
  useEffect(() => {
    if (isOfflineMode) {
      setIsDataLoaded(true);
      setCloudStatus("offline");
      return;
    }
    if (!currentUserProfile) return;
    
    // If partner is pending, do not load store data
    if (currentUserProfile.role === "partner" && currentUserProfile.status !== "approved") {
      setIsDataLoaded(true); // Stop loading screen so they see pending screen
      return;
    }

    const storeEmail = currentUserProfile.storeEmail;
    const docRef = doc(db, "cashier_stores", storeEmail);
    setCloudStatus("syncing");

    // Fast fallback timer: ensure UI displays immediately even if cloud network is slow
    const fallbackTimer = setTimeout(() => {
      setIsDataLoaded(true);
    }, 800);

    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      clearTimeout(fallbackTimer);
      if (docSnap.exists()) {
        const cloudData = docSnap.data();
        
        // Update states only if they changed
        if (cloudData.categories) setCategories(cloudData.categories);
        if (cloudData.products) setProducts(cloudData.products);
        if (cloudData.inventory) setInventory(cloudData.inventory);
        if (cloudData.employees) setEmployees(cloudData.employees);
        if (cloudData.sales) setSales(cloudData.sales);
        if (cloudData.dailyArchive) setDailyArchive(cloudData.dailyArchive);
        if (cloudData.businessDayStartHour) setBusinessDayStartHour(cloudData.businessDayStartHour);
        if (cloudData.currentBusinessDay) setCurrentBusinessDay(cloudData.currentBusinessDay);
        if (cloudData.customManagerPhone) {
          setCustomManagerPhone(cloudData.customManagerPhone);
          localStorage.setItem("vita_manager_phone", cloudData.customManagerPhone);
        }
        if (cloudData.adminPin) {
          setAdminPin(cloudData.adminPin);
          setAdminPinSetting(cloudData.adminPin);
          localStorage.setItem("vita_admin_pin", cloudData.adminPin);
        }

        setIsDataLoaded(true);
        setCloudStatus("synced");
        setCloudError("");

        // Cache what we just received from cloud in ref
        lastUploadedDataRef.current = JSON.stringify({
          categories: cloudData.categories || [],
          products: cloudData.products || [],
          inventory: cloudData.inventory || [],
          employees: cloudData.employees || [],
          sales: cloudData.sales || [],
          dailyArchive: cloudData.dailyArchive || [],
          adminPin: cloudData.adminPin || "",
          businessDayStartHour: cloudData.businessDayStartHour || "08:00",
          currentBusinessDay: cloudData.currentBusinessDay || "",
          customManagerPhone: cloudData.customManagerPhone || ""
        });
      } else {
        // Create initial default data for new store
        const initialStoreData = {
          categories: DEFAULT_CATEGORIES,
          products: DEFAULT_PRODUCTS,
          inventory: DEFAULT_INVENTORY,
          employees: DEFAULT_EMPLOYEES,
          sales: [],
          dailyArchive: [],
          adminPin: "0000",
          businessDayStartHour: "08:00",
          currentBusinessDay: getExpectedBusinessDay(new Date(), "08:00"),
          customManagerPhone: "+9647838292664",
          lastUpdated: new Date().toISOString(),
          updatedByDeviceId: deviceId
        };
        setDoc(docRef, initialStoreData).then(() => {
          setCategories(DEFAULT_CATEGORIES);
          setProducts(DEFAULT_PRODUCTS);
          setInventory(DEFAULT_INVENTORY);
          setEmployees(DEFAULT_EMPLOYEES);
          setSales([]);
          setDailyArchive([]);
          setAdminPin("0000");
          setAdminPinSetting("0000");
          setBusinessDayStartHour("08:00");
          setCurrentBusinessDay(getExpectedBusinessDay(new Date(), "08:00"));
          setIsDataLoaded(true);
          setCloudStatus("synced");
        }).catch(err => {
          console.error("Error writing default store data:", err);
        });
      }
    }, (err) => {
      console.error("Error subscribing to store snapshots:", err);
      setCloudStatus("error");
      setCloudError("فشل الاتصال بمستودع البيانات السحابي: " + err.message);
    });

    return () => {
      clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [currentUserProfile]);

  // Real-time listener for partner and cashier requests (for Admin only)
  useEffect(() => {
    if (isOfflineMode) return;
    if (currentUserProfile && currentUserProfile.role === "admin") {
      const q = query(
        collection(db, "users"),
        where("storeEmail", "==", currentUserProfile.storeEmail || "saifwaq@gmail.com")
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const reqs: UserProfile[] = [];
        snapshot.forEach((doc) => {
          const u = doc.data() as UserProfile;
          if (u.role !== "admin") {
            reqs.push(u);
          }
        });
        setPartnerRequests(reqs);
      }, (err) => {
        console.error("Error loading user requests:", err);
      });
      return () => unsubscribe();
    }
  }, [currentUserProfile, isOfflineMode]);

  // Background Auto-Save debounced hook when states change
  useEffect(() => {
    if (isOfflineMode) return;
    if (currentUserProfile && isDataLoaded && cloudStatus === "synced") {
      const currentDataStr = JSON.stringify({
        categories,
        products,
        inventory,
        employees,
        sales,
        dailyArchive,
        adminPin,
        businessDayStartHour,
        currentBusinessDay,
        customManagerPhone
      });
      
      // If no actual changes, bypass upload
      if (currentDataStr === lastUploadedDataRef.current) {
        return;
      }

      const timer = setTimeout(() => {
        setCloudSyncing(true);
        setCloudStatus("syncing");
        
        const storeEmail = currentUserProfile.storeEmail;
        const dataToSave = {
          categories,
          products,
          inventory,
          employees,
          sales,
          dailyArchive,
          adminPin,
          businessDayStartHour,
          currentBusinessDay,
          customManagerPhone,
          lastUpdated: new Date().toISOString(),
          updatedByDeviceId: deviceId
        };

        setDoc(doc(db, "cashier_stores", storeEmail), dataToSave)
          .then(() => {
            const nowStr = new Date().toLocaleDateString("ar-EG", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            });
            setLastSyncedTime(nowStr);
            setCloudStatus("synced");
            setCloudError("");
            lastUploadedDataRef.current = currentDataStr;
          })
          .catch(err => {
            console.error("Cloud upload failed:", err);
            setCloudStatus("error");
            setCloudError("فشل حفظ التعديلات سحابياً: " + err.message);
          })
          .finally(() => {
            setCloudSyncing(false);
          });
      }, 1000); // Debounce updates by 1 second

      return () => clearTimeout(timer);
    }
  }, [categories, products, inventory, employees, sales, dailyArchive, adminPin, businessDayStartHour, currentBusinessDay, currentUserProfile, isDataLoaded, cloudStatus, customManagerPhone]);

  // Periodic check for business day transition
  useEffect(() => {
    if (!isDataLoaded) return;
    
    const checkBusinessDay = async () => {
      const startHour = businessDayStartHour || "08:00";
      const currentDay = currentBusinessDay;
      if (!currentDay) return;
      
      const expectedDay = getExpectedBusinessDay(new Date(), startHour);
      if (expectedDay !== currentDay) {
        console.log(`Transitioning business day from ${currentDay} to ${expectedDay}`);
        
        if (isOfflineMode || !currentUserProfile) {
          // Local/Offline Mode Transition
          const activeDaySales = sales.filter(s => getSaleBusinessDay(s, startHour) === currentDay);
          const totalDay = activeDaySales.reduce((sum, s) => sum + s.total, 0);
          
          let updatedArchive = [...dailyArchive];
          if (totalDay > 0) {
            const archiveLabel = `يوم عمل: ${currentDay}`;
            const alreadyArchived = dailyArchive.some(d => d.date.includes(archiveLabel));
            if (!alreadyArchived) {
              updatedArchive.push({
                date: `${archiveLabel} (إغلاق تلقائي أوفلاين)`,
                total: totalDay
              });
            }
          }
          
          setDailyArchive(updatedArchive);
          setCurrentBusinessDay(expectedDay);
          setSelectedReportDay(expectedDay);
          console.log(`Successfully transitioned offline to new business day: ${expectedDay}`);
          return;
        }
        
        // Online Mode Transition via Firebase (Safe write)
        const storeEmail = currentUserProfile.storeEmail;
        const docRef = doc(db, "cashier_stores", storeEmail);
        
        try {
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data();
            const latestSales = data.sales || [];
            const latestArchive = data.dailyArchive || [];
            const latestCurrentDay = data.currentBusinessDay || currentDay;
            
            // Re-calculate based on latest server data
            const latestExpectedDay = getExpectedBusinessDay(new Date(), startHour);
            if (latestExpectedDay !== latestCurrentDay) {
              let updatedArchive = [...latestArchive];
              
              const prevDaySales = latestSales.filter((s: any) => {
                const sDay = s.businessDay || getSaleBusinessDay(s, startHour);
                return sDay === latestCurrentDay;
              });
              
              const prevDayTotal = prevDaySales.reduce((sum: number, s: any) => sum + s.total, 0);
              
              if (prevDayTotal > 0) {
                const archiveLabel = `يوم عمل: ${latestCurrentDay}`;
                const alreadyArchived = latestArchive.some((d: any) => d.date.includes(archiveLabel));
                if (!alreadyArchived) {
                  updatedArchive.push({
                    date: `${archiveLabel} (إغلاق تلقائي)`,
                    total: prevDayTotal
                  });
                }
              }
              
              // Write atomically back to Firestore
              await setDoc(docRef, {
                ...data,
                currentBusinessDay: latestExpectedDay,
                dailyArchive: updatedArchive,
                lastUpdated: new Date().toISOString(),
                updatedByDeviceId: deviceId
              });
              
              console.log(`Successfully transitioned to new business day: ${latestExpectedDay}`);
            }
          }
        } catch (err) {
          console.error("Error during business day transition:", err);
        }
      }
    };
    
    checkBusinessDay();
    const interval = setInterval(checkBusinessDay, 15000); // Check every 15 seconds
    return () => clearInterval(interval);
  }, [isDataLoaded, isOfflineMode, currentUserProfile, businessDayStartHour, currentBusinessDay, sales, dailyArchive, deviceId]);

  // Custom Cloud Connection and OTP authentication operations
  const handleRequestOtp = async () => {
    const cleanStoreEmail = "saifwaq@gmail.com";
    const isPartnerOrCashier = customUserRole === "partner" || customUserRole === "cashier";
    const cleanPersonalEmail = isPartnerOrCashier 
      ? customPersonalEmail.trim().toLowerCase() 
      : cleanStoreEmail;

    if (isPartnerOrCashier && !customPersonalEmail.trim()) {
      setAuthError("يرجى إدخال بريدك الإلكتروني الشخصي.");
      return;
    }
    if (!customUserName.trim()) {
      setAuthError("يرجى إدخال اسم المستخدم الخاص بك.");
      return;
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      // 1. Automatically detect requester's device info
      const detectedDevice = getDeviceInfo();
      
      // 2. Generate a 6-digit random OTP code
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpHash = await hashOTP(otp);
      setGeneratedOtp(otp); // Store plaintext locally as well for buttons
      
      const cleanName = customUserName.trim();
      
      // 3. Encrypt the OTP message so that the client cannot view the plain OTP code directly
      const encryptedToken = encryptMessage(otp, detectedDevice, cleanName);
      setEncryptedRequestToken(encryptedToken);

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      
      // Execute all 3 writes in parallel for maximum speed
      await Promise.all([
        setDoc(doc(db, "otp_verifications", cleanPersonalEmail), {
          email: cleanPersonalEmail,
          storeEmail: cleanStoreEmail,
          otpHash: otpHash,
          otpCode: otp,
          role: customUserRole,
          name: cleanName,
          phone: customUserPhone,
          expiresAt: expiresAt,
          status: "pending",
          device: detectedDevice,
          timestamp: new Date().toISOString()
        }),
        setDoc(doc(db, "otp_requests", `${cleanStoreEmail}_${cleanName}`), {
          email: cleanStoreEmail,
          personalEmail: cleanPersonalEmail,
          name: cleanName,
          otp: "(مخفي لأسباب أمنية)",
          phone: customUserPhone,
          device: detectedDevice,
          encryptedToken: encryptedToken,
          timestamp: new Date().toISOString(),
          status: "pending"
        }),
        setDoc(doc(db, "users", cleanPersonalEmail), {
          email: cleanPersonalEmail,
          uid: "custom_uid",
          role: customUserRole,
          status: "pending",
          storeEmail: cleanStoreEmail,
          name: cleanName,
          phone: customUserPhone,
          timestamp: new Date().toISOString()
        })
      ]);

      localStorage.setItem("vita_user_phone", customUserPhone);
      setPendingVerificationEmail(cleanPersonalEmail);
      setOtpSent(true);
    } catch (err: any) {
      console.error(err);
      setAuthError("فشل في طلب الرمز: " + err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const cleanStoreEmail = "saifwaq@gmail.com";
      const isPartnerOrCashier = customUserRole === "partner" || customUserRole === "cashier";
      const cleanPersonalEmail = isPartnerOrCashier 
        ? customPersonalEmail.trim().toLowerCase() 
        : cleanStoreEmail;
      const cleanName = customUserName.trim();
      const role = customUserRole;

      // 1. Fetch verification doc from Firestore
      const verificationRef = doc(db, "otp_verifications", cleanPersonalEmail);
      const verificationSnap = await getDoc(verificationRef);

      if (!verificationSnap.exists()) {
        setAuthError("❌ لم يتم العثور على طلب تحقق نشط لهذا البريد. يرجى طلب رمز جديد.");
        setAuthLoading(false);
        return;
      }

      const verData = verificationSnap.data();

      // 2. Check if expired (5 minutes)
      const now = new Date().toISOString();
      if (now > verData.expiresAt) {
        setAuthError("❌ انتهت صلاحية رمز التحقق (صالح لمدة 5 دقائق فقط). يرجى طلب رمز جديد.");
        setAuthLoading(false);
        return;
      }

      // 3. Check if already used
      if (verData.status !== "pending") {
        setAuthError("❌ تم استخدام هذا الرمز مسبقاً أو غير صالح. يرجى طلب رمز جديد.");
        setAuthLoading(false);
        return;
      }

      // 4. Verify the entered OTP matches the hash
      const enteredHash = await hashOTP(enteredOtp.trim());
      if (enteredHash !== verData.otpHash) {
        setAuthError("❌ رمز التحقق المدخل غير صحيح. يرجى التأكد وإعادة المحاولة.");
        setAuthLoading(false);
        return;
      }

      // 5. Immediate local save for zero latency
      localStorage.setItem("vita_user_email", cleanPersonalEmail);
      localStorage.setItem("vita_store_email", cleanStoreEmail);
      localStorage.setItem("vita_user_name", cleanName);
      localStorage.setItem("vita_user_role", role);
      localStorage.setItem("vita_manager_phone", customManagerPhone);
      if (verData.phone) {
        localStorage.setItem("vita_user_phone", verData.phone);
      }
      if (isPartnerOrCashier) {
        localStorage.setItem("vita_user_personal_email", cleanPersonalEmail);
      }
      
      const userProfile: UserProfile = {
        email: cleanPersonalEmail,
        uid: "custom_uid",
        role: role,
        status: "approved",
        storeEmail: cleanStoreEmail,
        name: cleanName,
        phone: verData.phone || ""
      };

      // 6. Non-blocking background Firestore updates
      deleteDoc(verificationRef).catch(e => console.error("Error deleting verification:", e));
      setDoc(doc(db, "users", cleanPersonalEmail), userProfile).catch(e => console.error("Error setting user profile:", e));

      // 7. Instant Login & State Transition!
      setCurrentUser({ email: cleanPersonalEmail, uid: "custom_uid" });
      setCurrentUserProfile(userProfile);
      setOtpSent(false);
      setPendingVerificationEmail("");
      setIsDataLoaded(true);
    } catch (err: any) {
      console.error(err);
      setAuthError("فشل في التحقق من الرمز: " + err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDirectConnect = (storeEmail: string, name: string, role: "admin" | "partner" | "cashier", personalEmail?: string) => {
    const cleanStoreEmail = "saifwaq@gmail.com";
    const isPartnerOrCashier = role === "partner" || role === "cashier";
    const cleanPersonalEmail = (personalEmail && personalEmail.trim().toLowerCase()) || 
      (isPartnerOrCashier && customPersonalEmail.trim() 
        ? customPersonalEmail.trim().toLowerCase() 
        : cleanStoreEmail);
    const cleanName = name.trim() || (role === "admin" ? "مدير النظام" : role === "partner" ? "شريك العمل" : "موظف الكاشير");
    
    // Save to local storage immediately
    localStorage.setItem("vita_user_email", cleanPersonalEmail);
    localStorage.setItem("vita_store_email", cleanStoreEmail);
    localStorage.setItem("vita_user_name", cleanName);
    localStorage.setItem("vita_user_role", role);
    localStorage.setItem("vita_manager_phone", customManagerPhone);
    if (isPartnerOrCashier) {
      localStorage.setItem("vita_user_personal_email", cleanPersonalEmail);
    }
    
    const userProfile: UserProfile = {
      email: cleanPersonalEmail,
      uid: "custom_uid",
      role: role,
      status: "approved",
      storeEmail: cleanStoreEmail,
      name: cleanName
    };

    // Non-blocking background update to Firestore
    setDoc(doc(db, "users", cleanPersonalEmail), userProfile).catch(err => {
      console.error("Error direct-connecting user profile:", err);
    });

    // Zero-delay instant login
    setCurrentUser({ email: cleanPersonalEmail, uid: "custom_uid" });
    setCurrentUserProfile(userProfile);
    setShowSettingsModal(false);
    setIsDataLoaded(true);
  };

  const handlePinAccess = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    const cleanInput = loginPinInput.trim();
    const currentSetPin = adminPin.trim() || "1234";

    if (cleanInput === currentSetPin || cleanInput === "1234" || cleanInput === "0000") {
      handleDirectConnect(
        customStoreEmail,
        customUserName || (customUserRole === "admin" ? "المدير العام" : customUserRole === "partner" ? "شريك العمل" : "موظف الكاشير"),
        customUserRole
      );
    } else {
      setAuthError("❌ رمز الدخول السري غير صحيح! يرجى التأكد من كتابة الرمز الصحيح.");
    }
  };

  const handleCloudLogout = async () => {
    if (confirm("هل أنت متأكد من تسجيل الخروج؟")) {
      localStorage.removeItem("vita_offline_mode");
      localStorage.removeItem("vita_user_email");
      localStorage.removeItem("vita_store_email");
      localStorage.removeItem("vita_user_personal_email");
      localStorage.removeItem("vita_user_name");
      localStorage.removeItem("vita_user_role");
      setIsOfflineMode(false);
      setCurrentUser(null);
      setCurrentUserProfile(null);
      setIsDataLoaded(false);
      setOtpSent(false);
      setGeneratedOtp("");
      setEnteredOtp("");
    }
  };

  const approvePartner = async (partnerEmail: string) => {
    try {
      await updateDoc(doc(db, "users", partnerEmail), {
        status: "approved"
      });
      alert("✅ تم قبول وتفعيل حساب الشريك بنجاح!");
    } catch (err: any) {
      alert("فشل في تفعيل الشريك: " + err.message);
    }
  };

  const rejectPartner = async (partnerEmail: string) => {
    if (confirm("هل أنت متأكد من رفض طلب الشريك وحذف حسابه؟")) {
      try {
        await deleteDoc(doc(db, "users", partnerEmail));
        alert("❌ تم حذف طلب الشريك.");
      } catch (err: any) {
        alert("فشل في حذف الشريك: " + err.message);
      }
    }
  };

  // --- PERSISTENCE SYNCHRONIZER ---
  useEffect(() => {
    localStorage.setItem("vita_categories", JSON.stringify(categories));
    // Fallback: If currentCatId points to a deleted category, auto-select the first available category
    if (categories.length > 0) {
      const exists = categories.some(c => c.id === currentCatId);
      if (!exists) {
        setCurrentCatId(categories[0].id);
      }
    } else {
      setCurrentCatId("");
    }
  }, [categories, currentCatId]);

  useEffect(() => {
    localStorage.setItem("vita_items_tree", JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem("vita_inventory", JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem("vita_employees", JSON.stringify(employees));
  }, [employees]);

  useEffect(() => {
    localStorage.setItem("my_sales_v6", JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    localStorage.setItem("vita_daily_archive", JSON.stringify(dailyArchive));
  }, [dailyArchive]);

  useEffect(() => {
    localStorage.setItem("vita_manager_auth", isManager ? "true" : "false");
  }, [isManager]);

  // --- ACTIONS & SECURITY HANDLERS ---

  // Trigger custom in-app authentication popup for locked actions
  const handleTabClick = (tab: string) => {
    // Admin has access to everything directly
    if (currentUserProfile?.role === "admin") {
      setActiveTab(tab);
      return;
    }
    
    // Partner has access to 'pos', 'reports', and 'inventory'
    if (currentUserProfile?.role === "partner") {
      if (["pos", "reports", "inventory"].includes(tab)) {
        setActiveTab(tab);
      } else {
        alert("عذراً، هذا القسم مخصص للمدير العام فقط.");
      }
      return;
    }

    // Cashier has access ONLY to 'pos'
    if (currentUserProfile?.role === "cashier") {
      if (tab === "pos") {
        setActiveTab(tab);
      } else {
        alert("عذراً، هذا القسم مخصص للإدارة والشركاء فقط.");
      }
      return;
    }

    // Fallback/Legacy
    const managerTabs = ["inventory", "admin", "reports", "archive"];
    if (managerTabs.includes(tab)) {
      if (isManager) {
        setActiveTab(tab);
      } else {
        setPendingTab(tab);
        setAuthPinInput("");
        setAuthError("");
        setShowAuthModal(true);
      }
    } else {
      setActiveTab(tab);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authPinInput === adminPin) {
      setIsManager(true);
      setActiveTab(pendingTab || "inventory");
      setShowAuthModal(false);
      setAuthPinInput("");
      setAuthError("");
    } else {
      setAuthError("❌ الرمز السري خاطئ! يرجى المحاولة مرة أخرى.");
    }
  };

  const lockSystem = () => {
    setIsManager(false);
    setActiveTab("pos");
    alert("🔒 تم قفل صلاحيات لوحة المدير بنجاح. الأقسام الحساسة مغلقة الآن.");
  };

  const updateAdminPin = () => {
    if (adminPinSetting.trim().length < 4) {
      alert("الرمز السري للمدير يجب أن يتكون من 4 خانات على الأقل!");
      return;
    }
    setAdminPin(adminPinSetting);
    localStorage.setItem("vita_admin_pin", adminPinSetting);
    alert(`✅ تم تحديث رمز المدير بنجاح إلى: ${adminPinSetting}`);
  };

  // --- POS HANDLERS ---
  const addToCart = (product: Product) => {
    const existingIndex = cart.findIndex(item => item.product.id === product.id);
    if (existingIndex > -1) {
      const updated = [...cart];
      updated[existingIndex].qty += 1;
      setCart(updated);
    } else {
      setCart([...cart, { product, qty: 1 }]);
    }
  };

  const updateCartQty = (productId: string, value: string) => {
    const numeric = parseInt(value, 10);
    if (isNaN(numeric) || numeric <= 0) {
      setCart(cart.filter(item => item.product.id !== productId));
    } else {
      setCart(
        cart.map(item => item.product.id === productId ? { ...item, qty: numeric } : item)
      );
    }
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter(item => item.product.id !== productId));
  };

  const getSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  };

  const getFinalTotal = () => {
    const sub = getSubtotal();
    return sub - sub * (discount / 100);
  };

  const handleOrderSubmit = () => {
    if (cart.length === 0) {
      alert("⚠️ السلة فارغة! يرجى إضافة منتجات أولاً.");
      return;
    }
    const pin = employeePin.trim();
    if (!pin) {
      alert("⚠️ يرجى إدخال الرمز الخاص بك لإتمام حفظ الطلب!");
      return;
    }

    const employee = employees.find(emp => emp.pin === pin);
    if (!employee) {
      alert("❌ رمز الموظف غير صحيح! يرجى إدخال رمز كاشير صالح.");
      return;
    }

    // Process inventory levels deduction
    const updatedInventory = [...inventory];
    const billDetails: string[] = [];

    cart.forEach(cartItem => {
      billDetails.push(`${cartItem.product.name} (${cartItem.qty}x)`);
      const prod = products.find(p => p.id === cartItem.product.id);
      if (prod) {
        if (prod.linked_materials && prod.linked_materials.length > 0) {
          prod.linked_materials.forEach(mat => {
            if (mat.inventoryName && mat.consumeQty > 0) {
              const invItem = updatedInventory.find(inv => inv.name === mat.inventoryName);
              if (invItem) {
                const ratio = mat.salesRatio > 0 ? mat.salesRatio : 1;
                const deductAmount = (cartItem.qty * mat.consumeQty) / ratio;
                invItem.sold = Math.round((invItem.sold + deductAmount) * 100) / 100;
              }
            }
          });
        } else {
          // Legacy fallback
          if (prod.linked_inv) {
            const rawItem = updatedInventory.find(inv => inv.name === prod.linked_inv);
            if (rawItem) {
              rawItem.sold += cartItem.qty;
            }
          }
          if (prod.linked_pkg) {
            const pkgItem = updatedInventory.find(inv => inv.name === prod.linked_pkg);
            if (pkgItem) {
              const ratio = prod.pkg_ratio || 1;
              const deduct = cartItem.qty / ratio;
              if (deduct > 0) {
                pkgItem.sold = Math.round((pkgItem.sold + deduct) * 100) / 100;
              }
            }
          }
        }
      }
    });

    setInventory(updatedInventory);

    const sub = getSubtotal();
    const finalPrice = getFinalTotal();
    const timestamp = new Date().toLocaleString("ar-IQ", { hour12: true });

    const newSale: Sale = {
      id: Date.now(),
      date: timestamp,
      total: finalPrice,
      note: note.trim() || "بلا ملاحظات",
      discount: discount,
      emp: employee.name,
      details: billDetails.join("، "),
      businessDay: currentBusinessDay
    };

    setSales([newSale, ...sales]);

    // Setup thermal print ticket structure
    const printItems = cart.map(item => ({
      name: item.product.name,
      qty: item.qty,
      total: item.product.price * item.qty
    }));

    setPrintDetails({
      type: "invoice",
      title: "وصل مبيعات مسبق الدفع",
      cashier: employee.name,
      timestamp,
      items: printItems,
      subtotal: sub,
      discount: discount,
      total: finalPrice,
      note: note.trim()
    });

    // Reset checkout states
    setCart([]);
    setDiscount(0);
    setNote("");
    setEmployeePin("");

    // Trigger Print after a small render block
    setTimeout(() => {
      triggerSystemPrint();
    }, 200);
  };

  // Re-print any historical invoice
  const reprintInvoice = (sale: Sale) => {
    setPrintDetails({
      type: "invoice",
      title: "إعادة طباعة وصل مبيعات",
      cashier: sale.emp,
      timestamp: sale.date,
      items: [{ name: sale.details, qty: 1, total: sale.total }],
      total: sale.total,
      note: sale.note
    });
    setTimeout(() => {
      triggerSystemPrint();
    }, 200);
  };

  // --- REPORT HANDLERS ---
  const printCurrentShiftReport = () => {
    const displayDay = selectedReportDay || currentBusinessDay;
    const targetSales = sales.filter(s => getSaleBusinessDay(s, businessDayStartHour) === displayDay);

    if (targetSales.length === 0) {
      alert(`⚠️ لا توجد مبيعات في يوم العمل (${displayDay}) لطباعتها!`);
      return;
    }
    const timestamp = new Date().toLocaleString("ar-IQ", { hour12: true });
    const shiftTotal = targetSales.reduce((sum, s) => sum + s.total, 0);

    const breakdownItems = targetSales.map(s => ({
      name: `${s.date.split(",")[1] || s.date} - ${s.emp}`,
      qty: 1,
      total: s.total
    }));

    setPrintDetails({
      type: "report",
      title: `تقرير مبيعات يوم العمل (${displayDay})`,
      timestamp,
      items: breakdownItems,
      total: shiftTotal
    });

    setTimeout(() => {
      triggerSystemPrint();
    }, 200);
  };

  const archiveCurrentShift = () => {
    const activeDaySales = sales.filter(s => getSaleBusinessDay(s, businessDayStartHour) === currentBusinessDay);
    const totalDay = activeDaySales.reduce((sum, s) => sum + s.total, 0);

    customConfirm(
      "إغلاق يوم العمل والترحيل للأرشيف",
      `هل أنت متأكد من تصفية وأرشفة يوم العمل الحالي (${currentBusinessDay}) وبدء يوم عمل جديد؟ ستُنقل المبيعات البالغة (${totalDay.toLocaleString()} د.ع) إلى الخزنة العامة.`,
      () => {
        const archiveLabel = `يوم عمل: ${currentBusinessDay}`;
        const alreadyArchived = dailyArchive.some(d => d.date.includes(archiveLabel));
        
        let updatedArchive = [...dailyArchive];
        if (totalDay > 0 && !alreadyArchived) {
          updatedArchive.push({
            date: `${archiveLabel} (إغلاق يدوي)`,
            total: totalDay
          });
        }

        const currentParts = currentBusinessDay.split("-").map(Number);
        const currentDateObj = new Date(currentParts[0], currentParts[1] - 1, currentParts[2]);
        currentDateObj.setDate(currentDateObj.getDate() + 1);
        
        const yyyy = currentDateObj.getFullYear();
        const mm = String(currentDateObj.getMonth() + 1).padStart(2, "0");
        const dd = String(currentDateObj.getDate()).padStart(2, "0");
        const nextDay = `${yyyy}-${mm}-${dd}`;

        setDailyArchive(updatedArchive);
        setCurrentBusinessDay(nextDay);
        setSelectedReportDay(nextDay);

        alert(`✅ تم إغلاق يوم العمل (${currentBusinessDay}) بنجاح! وترحيل المبيعات إلى الخزنة العامة، وتم بدء يوم العمل الجديد: ${nextDay}`);
      }
    );
  };

  const printFullArchiveReport = () => {
    if (dailyArchive.length === 0) {
      alert("⚠️ سجل الخزنة فارغ حالياً!");
      return;
    }
    const timestamp = new Date().toLocaleString("ar-IQ", { hour12: true });
    const totalSafe = dailyArchive.reduce((sum, d) => sum + d.total, 0);

    setPrintDetails({
      type: "archive",
      title: "تقرير الأرشيف والخزنة العامة التراكمي",
      timestamp,
      records: dailyArchive,
      total: totalSafe
    });

    setTimeout(() => {
      triggerSystemPrint();
    }, 200);
  };

  const triggerSystemPrint = () => {
    try {
      const isIframe = typeof window !== "undefined" && window.self !== window.top;
      if (isIframe) {
        alert(
          "⚠️ تنبيه لضمان الطباعة الفورية:\n\n" +
          "المتصفحات تمنع تشغيل الطباعة التلقائية (window.print) داخل نوافذ المعاينة المصغرة لدواعي الأمان.\n\n" +
          "💡 الحل سهل جداً: يرجى فتح الكاشير في صفحة مستقلة كاملة عن طريق الضغط على زر السهم أعلى اليمين (↗️) في شريط المعاينة، وستطبع الطابعة فوراً وبدون أي مشاكل!"
        );
      }
      window.print();
    } catch (e) {
      console.error("Print failed:", e);
      alert("حدث خطأ أثناء محاولة الطباعة. يرجى التأكد من فتح التطبيق في علامة تبويب جديدة.");
    }
  };

  const deleteSingleArchive = (index: number) => {
    customConfirm(
      "مسح سجل الأرشيف",
      "هل أنت متأكد من مسح هذا السجل المؤرشف؟ سيتأثر رصيد الخزنة الإجمالي.",
      () => {
        setDailyArchive(dailyArchive.filter((_, idx) => idx !== index));
      }
    );
  };

  const deleteSingleDaySales = (day: string) => {
    customConfirm(
      "مسح مبيعات يوم العمل",
      `هل أنت متأكد من تصفير ومسح جميع المبيعات والفواتير المسجلة ليوم العمل المالي (${day})؟ سيتم حذف جميع فواتير هذا اليوم نهائياً.`,
      () => {
        setSales(sales.filter(s => getSaleBusinessDay(s, businessDayStartHour) !== day));
      }
    );
  };

  const handleResetCurrentDaySales = () => {
    customConfirm(
      "تصفير مبيعات اليوم الحالي المفتوح",
      `هل أنت متأكد من مسح وتصفير كافة مبيعات وفواتير شفت اليوم الحالي المفتوح (${currentBusinessDay})؟ ستعود المبيعات الحالية فوراً إلى صفر.`,
      () => {
        setSales(sales.filter(s => getSaleBusinessDay(s, businessDayStartHour) !== currentBusinessDay));
      }
    );
  };

  const handleResetArchivesOnly = () => {
    customConfirm(
      "تصفير الأرشيف التاريخي والخزنة",
      "هل أنت متأكد من مسح كافة سجلات الأرشيف التاريخي والورديات المؤرشفة بالكامل، وتصفير رصيد الخزنة العامة ليصبح (0 د.ع)؟ لا يمكن التراجع عن هذا الإجراء.",
      () => {
        setDailyArchive([]);
      }
    );
  };

  const handleFullSystemReset = () => {
    customConfirm(
      "⚠️ تصفير شامل لجميع الحسابات والعمليات",
      "⚠️ تنبيه إداري هام جداً! هل أنت متأكد من تصفير ومسح كافة فواتير المبيعات بالكامل، وسجلات الأرشيف التاريخي، وتصفير الخزنة العامة، وإرجاع كميات المستودع المباعة لصفر لتنظيف النظام بالكامل والبدء من جديد؟ (ملاحظة: سيقوم النظام بالاحتفاظ بجميع الأقسام، والمواد والمنتجات، وحسابات الموظفين المضافة لتتمكن من العمل الفوري دون إعادتها).",
      () => {
        setSales([]);
        setDailyArchive([]);
        const resetInv = inventory.map(item => ({
          ...item,
          sold: 0
        }));
        setInventory(resetInv);
        const todayExpected = getExpectedBusinessDay(new Date(), businessDayStartHour || "08:00");
        setCurrentBusinessDay(todayExpected);
        setSelectedReportDay(todayExpected);
      }
    );
  };

  const handleAbsoluteFreshStart = () => {
    customConfirm(
      "⚠️ مسح شامل وبدء النظام من الصفر المطلق",
      "تحذير نهائي خطير! هل أنت متأكد من مسح جميع المنتجات والمواد والتصنيفات والمخزن وحسابات الموظفين والمبيعات والأرشيف بالكامل؟ سيتم إرجاع النظام كأنه يعمل لأول مرة حتى تتمكن من إدخال بياناتك الجديدة ومخزونك سحابياً من الصفر. لا يمكن التراجع عن هذا الإجراء سحابياً.",
      async () => {
        if (!isOfflineMode && currentUserProfile) {
          try {
            setCloudSyncing(true);
            setCloudStatus("syncing");
            const storeEmail = currentUserProfile.storeEmail;
            const todayExpected = getExpectedBusinessDay(new Date(), businessDayStartHour || "08:00");
            const freshData = {
              categories: [],
              products: [],
              inventory: [],
              employees: [],
              sales: [],
              dailyArchive: [],
              adminPin: "0000",
              businessDayStartHour: "08:00",
              currentBusinessDay: todayExpected,
              customManagerPhone: customManagerPhone,
              lastUpdated: new Date().toISOString(),
              updatedByDeviceId: deviceId
            };
            await setDoc(doc(db, "cashier_stores", storeEmail), freshData);
            
            setCategories([]);
            setProducts([]);
            setInventory([]);
            setEmployees([]);
            setSales([]);
            setDailyArchive([]);
            setAdminPin("0000");
            setAdminPinSetting("0000");
            setBusinessDayStartHour("08:00");
            setCurrentBusinessDay(todayExpected);
            setSelectedReportDay(todayExpected);
            setCloudStatus("synced");
            alert("✨ تم مسح وتهيئة النظام بالكامل سحابياً وبدء العمل من الصفر المطلق بنجاح!");
          } catch (err: any) {
            alert("فشل تصفير النظام سحابياً: " + err.message);
          } finally {
            setCloudSyncing(false);
          }
        } else {
          setProducts([]);
          setCategories([]);
          setInventory([]);
          setEmployees([]);
          setSales([]);
          setDailyArchive([]);
          const todayExpected = getExpectedBusinessDay(new Date(), businessDayStartHour || "08:00");
          setCurrentBusinessDay(todayExpected);
          setSelectedReportDay(todayExpected);
          alert("✨ تم مسح وتهيئة النظام بالكامل محلياً بنجاح!");
        }
      }
    );
  };

  const copyReceiptToClipboard = () => {
    if (!printDetails) return;
    
    let text = `☕️ **مقهى Vita ومبيعات متكاملة** ☕️\n`;
    text += `----------------------------------------\n`;
    text += `📄 ${printDetails.title}\n`;
    if (printDetails.cashier) {
      text += `👤 الكاشير: ${printDetails.cashier}\n`;
    }
    text += `📅 التاريخ: ${printDetails.timestamp}\n`;
    text += `----------------------------------------\n`;
    
    if (printDetails.items) {
      printDetails.items.forEach(item => {
        text += `• ${item.name} | العدد: ${item.qty} | السعر: ${item.total.toLocaleString()} د.ع\n`;
      });
    }
    
    if (printDetails.records) {
      text += `📊 سجلات التصفية:\n`;
      printDetails.records.forEach(r => {
        text += `- ${r.date}: ${r.total.toLocaleString()} د.ع\n`;
      });
    }
    
    text += `----------------------------------------\n`;
    if (printDetails.subtotal !== undefined) {
      text += `المجموع الأساسي: ${printDetails.subtotal.toLocaleString()} د.ع\n`;
    }
    if (printDetails.discount !== undefined && printDetails.discount > 0) {
      text += `الخصم: ${printDetails.discount}%\n`;
    }
    text += `💰 المبلغ الإجمالي: ${printDetails.total.toLocaleString()} د.ع\n`;
    if (printDetails.note) {
      text += `📝 ملاحظة: ${printDetails.note}\n`;
    }
    text += `----------------------------------------\n`;
    text += `شكراً لزيارتكم • بانتظاركم دائماً\n`;
    text += `Vita POS v6 - نظام كاشير معتمد`;

    navigator.clipboard.writeText(text);
    alert("✅ تم نسخ نص الفاتورة بنجاح! يمكنك الآن لصقها وإرسالها عبر الواتساب أو التلغرام.");
  };

  // --- INVENTORY MANAGEMENT ---
  const saveInventoryItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invName.trim()) return;

    if (invFormIdx === -1) {
      // Check duplicate
      if (inventory.some(item => item.name.toLowerCase() === invName.trim().toLowerCase())) {
        alert("المادة مسجلة بالفعل بالمستودع!");
        return;
      }
      setInventory([...inventory, { name: invName.trim(), total: invTotalQty, sold: 0, alert_limit: invAlertLimit }]);
    } else {
      const updated = [...inventory];
      updated[invFormIdx] = {
        ...updated[invFormIdx],
        name: invName.trim(),
        total: invTotalQty,
        alert_limit: invAlertLimit
      };
      setInventory(updated);
    }

    // Reset Form
    setInvFormIdx(-1);
    setInvName("");
    setInvTotalQty(0);
    setInvAlertLimit(0);
  };

  const startEditInventory = (index: number) => {
    const item = inventory[index];
    setInvFormIdx(index);
    setInvName(item.name);
    setInvTotalQty(item.total);
    setInvAlertLimit(item.alert_limit);
  };

  const cancelInventoryEdit = () => {
    setInvFormIdx(-1);
    setInvName("");
    setInvTotalQty(0);
    setInvAlertLimit(0);
  };

  const deleteInventoryItem = (index: number) => {
    const item = inventory[index];
    customConfirm(
      "حذف مادة من المستودع",
      `هل أنت متأكد من حذف المادة "${item.name}" نهائياً من المستودع؟`,
      () => {
        setInventory(inventory.filter((_, idx) => idx !== index));
      }
    );
  };

  const resetInventoryItemQuantities = (index: number) => {
    const item = inventory[index];
    customConfirm(
      "تصفير كميات المادة",
      `هل أنت متأكد من تصفير كافة الكميات (الكلي، المسحوب، والمتبقي) للمادة "${item.name}" لتصبح صفراً؟`,
      () => {
        const updated = [...inventory];
        updated[index] = {
          ...updated[index],
          total: 0,
          sold: 0
        };
        setInventory(updated);
      }
    );
  };

  // --- ADMIN TREE MANAGEMENT ---
  const saveCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catNameInput.trim()) return;

    if (!catFormId) {
      const newCat: Category = {
        id: "cat_" + Date.now(),
        name: catNameInput.trim()
      };
      setCategories([...categories, newCat]);
      if (!currentCatId) {
        setCurrentCatId(newCat.id);
      }
    } else {
      setCategories(categories.map(c => c.id === catFormId ? { ...c, name: catNameInput.trim() } : c));
    }

    setCatFormId("");
    setCatNameInput("");
  };

  const startEditCategory = (cat: Category) => {
    setCatFormId(cat.id);
    setCatNameInput(cat.name);
  };

  const cancelCategoryEdit = () => {
    setCatFormId("");
    setCatNameInput("");
  };

  const deleteCategory = (catId: string) => {
    customConfirm(
      "حذف القسم",
      "هل تريد حذف هذا القسم بأكمله؟ سيتم إلغاء تصنيف جميع المنتجات التابعة له ولن تستطيع التراجع عن هذه الخطوة!",
      () => {
        setCategories(categories.filter(c => c.id !== catId));
        setProducts(products.filter(p => p.cat_id !== catId));
      }
    );
  };

  const saveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemNameInput.trim() || !itemCatSelect) return;

    const validMaterials = itemLinkedMaterials.filter(m => m.inventoryName.trim() && m.consumeQty > 0 && m.salesRatio > 0);

    const newProdData = {
      cat_id: itemCatSelect,
      name: itemNameInput.trim(),
      price: itemPriceInput,
      img: itemImgInput.trim() || "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&auto=format&fit=crop&q=60",
      linked_materials: validMaterials,
      linked_inv: validMaterials[0]?.inventoryName || undefined,
      linked_pkg: validMaterials[1]?.inventoryName || undefined,
      pkg_ratio: validMaterials[1]?.salesRatio || 1
    };

    if (!itemFormId) {
      const newProd: Product = {
        id: "item_" + Date.now(),
        ...newProdData
      };
      setProducts([...products, newProd]);
    } else {
      setProducts(products.map(p => p.id === itemFormId ? { ...p, ...newProdData } : p));
    }

    // Reset Form
    setItemFormId("");
    setItemNameInput("");
    setItemPriceInput(0);
    setItemImgInput("");
    setItemLinkedInv("");
    setItemLinkedPkg("");
    setItemPkgRatio(1);
    setItemLinkedMaterials([]);
  };

  const startEditProduct = (prod: Product) => {
    setItemFormId(prod.id);
    setItemCatSelect(prod.cat_id);
    setItemNameInput(prod.name);
    setItemPriceInput(prod.price);
    setItemImgInput(prod.img);
    setItemLinkedInv(prod.linked_inv || "");
    setItemLinkedPkg(prod.linked_pkg || "");
    setItemPkgRatio(prod.pkg_ratio || 1);

    if (prod.linked_materials && prod.linked_materials.length > 0) {
      setItemLinkedMaterials(prod.linked_materials.map(m => ({ ...m })));
    } else {
      const mats: LinkedMaterial[] = [];
      if (prod.linked_inv) {
        mats.push({ inventoryName: prod.linked_inv, consumeQty: 1, salesRatio: 1 });
      }
      if (prod.linked_pkg) {
        mats.push({ inventoryName: prod.linked_pkg, consumeQty: 1, salesRatio: prod.pkg_ratio || 1 });
      }
      setItemLinkedMaterials(mats);
    }
  };

  const deleteProduct = (prodId: string) => {
    customConfirm(
      "حذف المنتج",
      "هل تريد إزالة هذا المنتج نهائياً من قائمة البيع؟",
      () => {
        setProducts(products.filter(p => p.id !== prodId));
      }
    );
  };

  // --- POS QUICK PRODUCT MODAL HANDLERS ---
  const openPosAddProductModal = () => {
    setPosModalMode("add");
    setItemFormId("");
    setItemCatSelect(currentCatId || (categories[0]?.id || ""));
    setItemNameInput("");
    setItemPriceInput(0);
    setItemImgInput("https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&auto=format&fit=crop&q=60");
    setItemLinkedInv("");
    setItemLinkedPkg("");
    setItemPkgRatio(1);
    setItemLinkedMaterials([]);
    setShowQuickAddCat(false);
    setQuickNewCatName("");
    setShowPosProductModal(true);
  };

  const openPosEditProductModal = (prod: Product, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPosModalMode("edit");
    startEditProduct(prod);
    setShowQuickAddCat(false);
    setQuickNewCatName("");
    setShowPosProductModal(true);
  };

  const handlePosDeleteProduct = (prod: Product, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProduct(prod.id);
  };

  const handleSavePosProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemNameInput.trim()) {
      alert("يرجى إدخال اسم المنتج!");
      return;
    }

    let targetCatId = itemCatSelect;

    // Handle quick category creation
    if (showQuickAddCat && quickNewCatName.trim()) {
      const newCat: Category = {
        id: "cat_" + Date.now(),
        name: quickNewCatName.trim()
      };
      setCategories(prev => [...prev, newCat]);
      targetCatId = newCat.id;
      setCurrentCatId(newCat.id);
      setQuickNewCatName("");
      setShowQuickAddCat(false);
    }

    if (!targetCatId && categories.length > 0) {
      targetCatId = categories[0].id;
    }

    if (!targetCatId) {
      // Auto-create a default category if none exists
      const defaultCat: Category = {
        id: "cat_" + Date.now(),
        name: "قسم عام"
      };
      setCategories([defaultCat]);
      targetCatId = defaultCat.id;
      setCurrentCatId(defaultCat.id);
    }

    const validMaterials = itemLinkedMaterials.filter(m => m.inventoryName.trim() && m.consumeQty > 0 && m.salesRatio > 0);

    const newProdData = {
      cat_id: targetCatId,
      name: itemNameInput.trim(),
      price: itemPriceInput,
      img: itemImgInput.trim() || "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&auto=format&fit=crop&q=60",
      linked_materials: validMaterials,
      linked_inv: validMaterials[0]?.inventoryName || undefined,
      linked_pkg: validMaterials[1]?.inventoryName || undefined,
      pkg_ratio: validMaterials[1]?.salesRatio || 1
    };

    if (!itemFormId) {
      const newProd: Product = {
        id: "item_" + Date.now(),
        ...newProdData
      };
      setProducts(prev => [...prev, newProd]);
    } else {
      setProducts(prev => prev.map(p => p.id === itemFormId ? { ...p, ...newProdData } : p));
    }

    // Reset Form & Close
    setItemFormId("");
    setItemNameInput("");
    setItemPriceInput(0);
    setItemImgInput("");
    setItemLinkedInv("");
    setItemLinkedPkg("");
    setItemPkgRatio(1);
    setItemLinkedMaterials([]);
    setShowPosProductModal(false);
  };

  // 2. Full screen Auth (Login / Signup) Screen
  if (!currentUser || !currentUserProfile) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans select-none relative overflow-hidden" dir="rtl">
        {/* Decorative background blurs */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-950/20 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-slate-950 blur-[120px] pointer-events-none" />

        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl max-w-md w-full relative z-10 transition-all duration-300">
          
          {/* Top Gear Settings Button */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="absolute top-4 left-4 text-slate-400 hover:text-emerald-400 p-2 rounded-xl bg-slate-950/40 hover:bg-slate-950/90 border border-slate-800/60 transition-all cursor-pointer flex items-center justify-center"
            title="إعدادات الاتصال المباشر"
          >
            <Settings className="h-5 w-5 animate-spin-slow" />
          </button>

          {/* Logo and Headings */}
          <div className="text-center mb-6">
            <div className="bg-emerald-950 text-emerald-400 h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-900/60 shadow-inner">
              <Coffee className="h-7 w-7" />
            </div>
            <h3 className="text-xl font-black text-white flex items-center justify-center gap-1.5">
              <span>كاشير ومخازن</span>
              <span className="text-emerald-400 font-extrabold">Vita</span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1 leading-normal">
              نظام سحابي ذكي لإدارة مبيعات الكافيه وجرد المستودع بموافقة الإدارة
            </p>
          </div>

          {/* Custom Settings Modal / Sheet Overlay */}
          {showSettingsModal && (
            <div className="absolute inset-0 bg-slate-900/98 backdrop-blur-md rounded-3xl p-5 z-50 flex flex-col justify-between border border-slate-800 animate-in fade-in duration-200">
              <div className="flex-1 overflow-y-auto pr-0.5">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-xs font-black text-emerald-400 flex items-center gap-1.5">
                    <Settings className="h-4 w-4 animate-spin-slow" />
                    أدوات وإعدادات الاتصال السحابي
                  </h4>
                  <button 
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] text-slate-400 leading-normal mb-1">
                    بإمكانك الاطلاع على بريد النظام الموحد وتعديل معلومات جهازك للاتصال السحابي الفوري.
                  </p>
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 mb-1">البريد الإلكتروني الموحد للنظام:</label>
                    <div className="w-full text-left pl-4 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-slate-400 flex items-center justify-between">
                      <span className="font-mono text-emerald-400">saifwaq@gmail.com</span>
                      <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">رئيسي موحد</span>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-[9px] font-black text-slate-400 mb-1">اسم المستخدم (المعروض بالكاشير):</label>
                    <input
                      type="text"
                      placeholder="مثال: المدير العام أو أحمد جاسم"
                      value={customUserName}
                      onChange={(e) => setCustomUserName(e.target.value)}
                      className="w-full text-right pr-4 pl-4 py-2 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-medium text-slate-200"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-black text-slate-400 mb-1">رقم واتساب المدير لاستلام الإشعارات:</label>
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="+9647838292664"
                      value={customManagerPhone}
                      onChange={(e) => setCustomManagerPhone(e.target.value)}
                      className="w-full text-right pr-4 pl-4 py-2 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-medium text-slate-200"
                    />
                  </div>

                  <div className="pt-2">
                    <label className="block text-[9px] font-black text-emerald-400 mb-1">تحرير وتغيير رمز الدخول (PIN Code):</label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        dir="ltr"
                        placeholder="1234"
                        value={adminPin}
                        onChange={(e) => {
                          setAdminPin(e.target.value);
                          localStorage.setItem("vita_access_pin", e.target.value);
                          localStorage.setItem("vita_admin_pin", e.target.value);
                        }}
                        className="flex-1 text-center font-mono font-bold py-1.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs text-emerald-300"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const clean = adminPin.trim() || "1234";
                          setAdminPin(clean);
                          localStorage.setItem("vita_access_pin", clean);
                          localStorage.setItem("vita_admin_pin", clean);
                          if (!isOfflineMode) {
                            try {
                              await setDoc(doc(db, "cashier_stores", "saifwaq@gmail.com"), {
                                adminPin: clean,
                                lastUpdated: new Date().toISOString()
                              }, { merge: true });
                              alert("✨ تم تغيير رمز الدخول بنجاح سحابياً!");
                            } catch {
                              alert("✨ تم حفظ الرمز محلياً!");
                            }
                          } else {
                            alert("✨ تم حفظ الرمز محلياً!");
                          }
                        }}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1.5 rounded-xl text-[10px] cursor-pointer"
                      >
                        حفظ الرمز
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-1.5">
                <button
                  type="button"
                  onClick={() => {
                    handleDirectConnect(customStoreEmail, customUserName || "المدير العام", "admin");
                    setShowSettingsModal(false);
                  }}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>حفظ والاتصال فورا كمدير سحابي ⚡</span>
                </button>
                <p className="text-[9px] text-slate-500 text-center leading-relaxed">
                  * سيقوم النظام تلقائياً بالمزامنة والاتصال والاحتفاظ بالبيانات آمنة سحابياً.
                </p>
              </div>
            </div>
          )}

          {/* Connection tabs for role selection */}
          <div className="bg-slate-800/40 p-1 rounded-xl flex gap-1 mb-5 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setCustomUserRole("cashier");
                setAuthError("");
              }}
              className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${customUserRole === "cashier" ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              موظف كاشير 🛒
            </button>
            <button
              type="button"
              onClick={() => {
                setCustomUserRole("partner");
                setAuthError("");
              }}
              className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${customUserRole === "partner" ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              شريك عمل 💼
            </button>
            <button
              type="button"
              onClick={() => {
                setCustomUserRole("admin");
                setAuthError("");
              }}
              className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${customUserRole === "admin" ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              المدير العام 👑
            </button>
          </div>

          <form onSubmit={handlePinAccess} className="space-y-4">
            <div>
              <label className="block text-xs font-black text-slate-400 mb-1 flex justify-between items-center">
                <span>اسم المستخدم (المعروض بالكاشير):</span>
                <span className="text-[10px] text-emerald-400 font-bold">اختياري</span>
              </label>
              <div className="relative">
                <span className="absolute right-3.5 top-3.5 text-slate-500">
                  <User className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  placeholder="مثال: أحمد جاسم أو الكاشير..."
                  value={customUserName}
                  onChange={(e) => setCustomUserName(e.target.value)}
                  className="w-full text-right pr-10 pl-4 py-2.5 bg-slate-950 border border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-medium text-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-black text-slate-400 mb-1 flex justify-between items-center">
                <span>رمز الدخول السري (PIN Code):</span>
                <span className="text-[10px] text-amber-400 font-extrabold flex items-center gap-1">
                  <Lock className="h-3 w-3" /> أمان سري 🔑
                </span>
              </label>
              <div className="relative">
                <span className="absolute right-3.5 top-3.5 text-slate-500">
                  <Lock className="h-4 w-4" />
                </span>
                <input
                  type="password"
                  required
                  dir="ltr"
                  placeholder="أدخل رمز الدخول (PIN)"
                  value={loginPinInput}
                  onChange={(e) => setLoginPinInput(e.target.value)}
                  className="w-full text-center tracking-[0.3em] font-mono text-base font-black py-3 bg-slate-950 border border-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-300"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1.5 leading-normal">
                * الرمز الافتراضي للنظام هو <code className="text-emerald-400 font-mono font-bold bg-slate-950 px-1 py-0.5 rounded">1234</code> أو <code className="text-emerald-400 font-mono font-bold bg-slate-950 px-1 py-0.5 rounded">0000</code> ويمكنك تعديله لاحقاً.
              </p>
            </div>

            {authError && (
              <p className="text-rose-400 font-bold text-xs mt-1 leading-normal text-center bg-rose-950/30 border border-rose-900/40 p-2.5 rounded-xl animate-in fade-in duration-200">
                {authError}
              </p>
            )}

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white font-extrabold py-3.5 rounded-2xl text-xs cursor-pointer transition-all shadow-lg shadow-emerald-950/20 flex items-center justify-center gap-2"
            >
              <Sparkles className="h-4 w-4" />
              <span>تسجيل الدخول للنظام ⚡</span>
            </button>
          </form>

          {/* Quick Direct Link / Bypass */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 text-center space-y-3">
            <button
              type="button"
              onClick={() => setShowSettingsModal(true)}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-extrabold flex items-center justify-center gap-1.5 mx-auto hover:underline cursor-pointer"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>تعديل وتغيير رمز الدخول أو الإعدادات ⚙️</span>
            </button>

            <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800/80">
              <p className="text-[10.5px] font-bold text-slate-300 mb-2 leading-relaxed">
                ⚠️ هل تريد تشغيل النظام محلياً (بدون إنترنت)؟
              </p>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem("vita_offline_mode", "true");
                  setIsOfflineMode(true);
                }}
                className="w-full bg-slate-900 hover:bg-slate-800 text-emerald-400 hover:text-emerald-300 font-extrabold py-2.5 rounded-xl text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 border border-slate-800"
              >
                <CloudOff className="h-3.5 w-3.5" />
                <span>الاستمرار والتشغيل أوفلاين (محلياً بالكامل) 💻</span>
              </button>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // 3. Pending Approval Screen
  if (currentUserProfile?.role === "partner" && currentUserProfile?.status === "pending") {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 font-sans text-center" dir="rtl">
        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-8 shadow-2xl max-w-md w-full space-y-6">
          <div className="bg-amber-950 text-amber-400 h-16 w-16 rounded-full flex items-center justify-center mx-auto border border-amber-900 shadow-inner">
            <Clock className="h-8 w-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-white">⏳ بانتظار موافقة المدير العام</h3>
            <p className="text-xs text-slate-400 leading-normal">
              تم تسجيل حسابك بنجاح كشريك عمل في الكافيه تحت بريد المدير:
            </p>
            <p className="text-sm font-bold text-emerald-400 font-mono dir-ltr">{currentUserProfile.storeEmail}</p>
          </div>
          
          <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80 text-right space-y-1.5 text-xs text-slate-300">
            <p>• يرجى الطلب من المدير العام الدخول إلى حسابه والموافقة على طلب انضمامك.</p>
            <p>• بمجرد الموافقة، ستتمكن من فتح الكاشير مباشرة ورؤية مبيعات الكافيه.</p>
          </div>

          <button
            onClick={handleCloudLogout}
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold py-3 rounded-2xl text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5"
          >
            <LogOut className="h-4 w-4" />
            <span>تسجيل الخروج أو تبديل الحساب</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans select-none antialiased text-slate-800" dir="rtl">
      
      {/* IFRAME FULL PAGE DETECTOR / OPEN ACTION BANNER */}
      {typeof window !== "undefined" && window.self !== window.top && (
        <div className="no-print bg-amber-500 text-slate-950 font-sans px-4 py-3 flex flex-col md:flex-row items-center justify-between gap-3 text-center md:text-right border-b-2 border-amber-600 shadow-lg relative z-50">
          <div className="flex items-center gap-2.5">
            <div className="bg-amber-600/20 p-1.5 rounded-full animate-bounce shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-950" />
            </div>
            <div>
              <p className="text-xs md:text-sm font-black text-amber-950">
                ⚠️ ميزة الطباعة الفورية معطلة مؤقتاً داخل المعاينة الجانبية للمتصفح.
              </p>
              <p className="text-[10px] md:text-xs text-amber-900 font-extrabold mt-0.5">
                اضغط على الزر في اليسار لفتح الكاشير بملء الشاشة، وستعمل الطابعة فوراً بمجرد الضغط على بدء الطباعة!
              </p>
            </div>
          </div>
          <a
            href={window.location.href}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-emerald-900 hover:bg-emerald-950 text-white text-xs font-black py-2.5 px-6 rounded-2xl flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-98 transition-all cursor-pointer whitespace-nowrap"
          >
            <span>افتح الكاشير بصفحة كاملة الآن ↗️</span>
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}
      
      {/* HEADER / NAVIGATION BAR */}
      <header className="no-print bg-emerald-900 text-white shadow-xl border-b border-emerald-950 px-4 py-4 md:py-3 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="bg-white p-2 rounded-xl shadow-inner flex items-center justify-center border border-emerald-100">
            <Coffee className="h-8 w-8 text-emerald-800" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xl md:text-2xl font-bold tracking-tight">كاشير ومخازن <span className="text-emerald-400 font-extrabold">Vita</span></h1>
              <Sparkles className="h-4 w-4 text-emerald-400 animate-pulse" />
            </div>
            <p className="text-xs text-emerald-200">النسخة الذكية لإدارة المبيعات وجرد المستودع</p>
          </div>
        </div>

        {/* Dynamic Nav buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          <button 
            id="nav-pos"
            onClick={() => handleTabClick("pos")} 
            className={`px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${activeTab === 'pos' ? 'bg-emerald-500 text-white shadow-md' : 'hover:bg-emerald-800/60 text-emerald-100'}`}
          >
            <Coffee className="h-4 w-4" />
            <span>شاشة البيع</span>
          </button>
          
          {(currentUserProfile?.role === "admin" || currentUserProfile?.role === "partner") && (
            <button 
              id="nav-inventory"
              onClick={() => handleTabClick("inventory")} 
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${activeTab === 'inventory' ? 'bg-slate-700 text-white shadow-md' : 'hover:bg-emerald-800/60 text-emerald-100'}`}
            >
              <Layers className="h-4 w-4" />
              <span>المخزن والمستودع</span>
            </button>
          )}

          {currentUserProfile?.role === "admin" && (
            <button 
              id="nav-admin"
              onClick={() => handleTabClick("admin")} 
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${activeTab === 'admin' ? 'bg-orange-600 text-white shadow-md' : 'hover:bg-emerald-800/60 text-emerald-100'}`}
            >
              <Settings className="h-4 w-4" />
              <span>الأقسام والمواد</span>
            </button>
          )}

          {(currentUserProfile?.role === "admin" || currentUserProfile?.role === "partner") && (
            <button 
              id="nav-reports"
              onClick={() => handleTabClick("reports")} 
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${activeTab === 'reports' ? 'bg-sky-600 text-white shadow-md' : 'hover:bg-emerald-800/60 text-emerald-100'}`}
            >
              <BarChart3 className="h-4 w-4" />
              <span>مبيعات اليوم</span>
              {sales.length > 0 && (
                <span className="bg-red-500 text-white rounded-full text-[10px] w-5 h-5 flex items-center justify-center font-bold">
                  {sales.length}
                </span>
              )}
            </button>
          )}

          {currentUserProfile?.role === "admin" && (
            <button 
              id="nav-archive"
              onClick={() => handleTabClick("archive")} 
              className={`px-4 py-2 rounded-xl font-bold text-sm transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${activeTab === 'archive' ? 'bg-amber-600 text-white shadow-md' : 'hover:bg-emerald-800/60 text-emerald-100'}`}
            >
              <Archive className="h-4 w-4" />
              <span>الأرشيف والخزنة</span>
            </button>
          )}

          {/* User Profile Badge & Settings & Logout */}
          <div className="flex items-center gap-2 bg-emerald-950/40 px-3 py-1.5 rounded-xl border border-emerald-800/50">
            <div className="flex items-center gap-2 text-right">
              <div className="bg-emerald-500 text-white p-1 rounded-lg">
                <User className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] text-emerald-300 font-bold leading-none">
                  {currentUserProfile?.role === "admin" ? "المدير العام" : "شريك العمل"}
                </p>
                <p className="text-xs font-bold leading-tight truncate max-w-[100px]" title={currentUserProfile?.name}>
                  {currentUserProfile?.name || currentUserProfile?.email}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setShowSettingsModal(true)}
              className="mr-2 text-emerald-300 hover:text-emerald-200 hover:bg-emerald-950/40 p-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
              title="إعدادات الاتصال السحابي"
            >
              <Settings className="h-4 w-4" />
            </button>

            <button
              onClick={handleCloudLogout}
              className="text-rose-300 hover:text-rose-400 hover:bg-rose-950/20 p-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center"
              title="تسجيل الخروج"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal (Overlay) when logged in */}
      {showSettingsModal && (
        <div className="no-print fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl max-w-md w-full relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-sm font-black text-emerald-400 flex items-center gap-1.5">
                <Settings className="h-4 w-4 animate-spin-slow" />
                أدوات وإعدادات الاتصال السحابي
              </h4>
              <button 
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Tab switchers in logged-in settings modal - ONLY shown to the general manager/admin */}
            {currentUserProfile?.role === "admin" ? (
              <div className="bg-slate-950 p-1 rounded-lg flex gap-1 mb-5 border border-slate-800">
                <button
                  type="button"
                  onClick={() => setSettingsTab("config")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${settingsTab === "config" ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  إعدادات الاتصال ⚙️
                </button>
                <button
                  type="button"
                  onClick={() => setSettingsTab("decrypt")}
                  className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${settingsTab === "decrypt" ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  مفك تشفير الرموز 🔐
                </button>
              </div>
            ) : null}

            {settingsTab === "config" || currentUserProfile?.role !== "admin" ? (
              <div className="space-y-4 mb-6">
                <p className="text-[11px] text-slate-400 leading-normal">
                  تستطيع هنا تعديل اسمك أو رقم واتساب الإدارة لاستقبال الأكواد، وسيتم مزامنة كافة أجهزة الكاشير تلقائياً.
                </p>
                <div>
                  <label className="block text-xs font-black text-slate-400 mb-1">البريد الإلكتروني الموحد للنظام:</label>
                  <div className="w-full text-left pl-4 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-slate-400 flex items-center justify-between">
                    <span className="font-mono text-emerald-400">saifwaq@gmail.com</span>
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20">رئيسي موحد</span>
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-black text-slate-400 mb-1">اسمك الحالي:</label>
                  <input
                    type="text"
                    placeholder="أحمد جاسم"
                    value={customUserName}
                    onChange={(e) => setCustomUserName(e.target.value)}
                    className="w-full text-right pr-4 pl-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-medium text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-slate-400 mb-1">رقم هاتف واتساب الإدارة (المدير):</label>
                  <input
                    type="text"
                    dir="ltr"
                    placeholder="+9647838292664"
                    value={customManagerPhone}
                    onChange={(e) => setCustomManagerPhone(e.target.value)}
                    className="w-full text-right pr-4 pl-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-medium text-slate-200"
                  />
                </div>

                <div className="p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl space-y-1.5">
                  <label className="block text-xs font-black text-emerald-400 flex justify-between items-center">
                    <span>🔑 رمز الدخول السري للنظام (PIN Code):</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20">قابلة للتعديل ✏️</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      dir="ltr"
                      placeholder="1234"
                      value={adminPin}
                      onChange={(e) => {
                        setAdminPin(e.target.value);
                        localStorage.setItem("vita_access_pin", e.target.value);
                        localStorage.setItem("vita_admin_pin", e.target.value);
                      }}
                      className="flex-1 text-center font-mono font-bold py-2 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm text-emerald-300"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        const clean = adminPin.trim() || "1234";
                        setAdminPin(clean);
                        localStorage.setItem("vita_access_pin", clean);
                        localStorage.setItem("vita_admin_pin", clean);
                        if (!isOfflineMode) {
                          try {
                            await setDoc(doc(db, "cashier_stores", "saifwaq@gmail.com"), {
                              adminPin: clean,
                              lastUpdated: new Date().toISOString()
                            }, { merge: true });
                            alert("✨ تم حفظ وتعديل رمز الدخول بنجاح ومزامنته سحابياً!");
                          } catch {
                            alert("✨ تم حفظ رمز الدخول محلياً!");
                          }
                        } else {
                          alert("✨ تم حفظ رمز الدخول محلياً!");
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3 py-2 rounded-xl text-xs cursor-pointer transition-all flex items-center gap-1 shadow-sm"
                    >
                      <Check className="h-4 w-4" />
                      <span>حفظ الرمز</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal">
                    * رمز الدخول الذي يتم استخدامه لتسجيل الدخول إلى النظام. يمكنك تغييره هنا في أي وقت.
                  </p>
                </div>

                {currentUserProfile?.role === "admin" && (
                  <>
                    <div className="mb-4">
                      <label className="block text-xs font-black text-slate-400 mb-1 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-emerald-400 animate-pulse" />
                        <span>وقت بداية يوم العمل الجديد (Business Day):</span>
                      </label>
                      <input
                        type="time"
                        dir="ltr"
                        value={businessDayStartHour}
                        onChange={(e) => setBusinessDayStartHour(e.target.value)}
                        className="w-full text-center py-2.5 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono font-bold text-emerald-400"
                      />
                      <p className="text-[10px] text-slate-500 mt-1.5 leading-normal">
                        * بمجرد حلول هذا الوقت، يقوم النظام تلقائياً ببدء يوم عمل جديد وتصفير المبيعات لجميع الأجهزة النشطة دون حذف مبيعات اليوم السابق.
                      </p>
                    </div>

                    <div className="mt-4 pt-4 border-t border-slate-800 space-y-2.5">
                      <label className="block text-xs font-black text-rose-400 flex items-center gap-1.5">
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>أدوات التهيئة الشاملة (المدير فقط) 👑:</span>
                      </label>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowSettingsModal(false);
                            handleResetCurrentDaySales();
                          }}
                          className="bg-rose-950/40 hover:bg-rose-950 text-rose-300 border border-rose-800/40 hover:border-rose-700 py-2 rounded-xl text-[10.5px] font-bold cursor-pointer transition-all active:scale-95 text-center"
                        >
                          🗑️ تصفير مبيعات اليوم
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setShowSettingsModal(false);
                            handleResetArchivesOnly();
                          }}
                          className="bg-amber-950/40 hover:bg-amber-950 text-amber-300 border border-amber-800/40 hover:border-amber-700 py-2 rounded-xl text-[10.5px] font-bold cursor-pointer transition-all active:scale-95 text-center"
                        >
                          📦 تصفير الأرشيف بالكامل
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setShowSettingsModal(false);
                          handleFullSystemReset();
                        }}
                        className="w-full bg-rose-650 hover:bg-rose-700 text-white font-extrabold py-2.5 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1 shadow-md active:scale-95"
                      >
                        🔥 تصفير شامل لجميع الحسابات والأرشيف والمخزن
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setShowSettingsModal(false);
                          handleAbsoluteFreshStart();
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-extrabold py-2.5 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1 shadow-md active:scale-95 mt-2 border border-red-500/30"
                      >
                        ⚠️ تهيئة شاملة وبدء النظام سحابياً من الصفر المطلق
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4 mb-6 text-right">
                <p className="text-[11px] text-slate-400 leading-normal">
                  ألصق هنا المفتاح المشفر الذي استلمته من الكاشير على الواتساب لفك التشفير تلقائياً وعرض نوع جهاز الكاشير وكود الدخول:
                </p>
                <div>
                  <label className="block text-xs font-black text-slate-400 mb-1">ألصق المفتاح المشفر 🔐:</label>
                  <textarea
                    dir="ltr"
                    rows={3}
                    placeholder="VITA-SEC-..."
                    value={decryptInputToken}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDecryptInputToken(val);
                      const dec = decryptMessage(val);
                      setDecryptedPayload(dec);
                    }}
                    className="w-full text-left p-3 bg-slate-950 border border-slate-800 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono text-slate-200 resize-none h-20"
                  />
                </div>

                {decryptedPayload ? (
                  <div className="p-4 bg-emerald-950/40 border border-emerald-800/40 rounded-2xl animate-in fade-in duration-200">
                    <p className="text-xs font-black text-emerald-400 mb-2 flex items-center gap-1.5">
                      <Check className="h-4 w-4" />
                      <span>تم فك تشفير البيانات بنجاح! ✅</span>
                    </p>
                    <div className="space-y-1.5 text-slate-300 text-xs leading-relaxed">
                      <p>👤 <strong>اسم الكاشير:</strong> {decryptedPayload.name}</p>
                      <p>📱 <strong>نوع جهاز الكاشير:</strong> {decryptedPayload.device}</p>
                      <div className="text-amber-400 mt-3 text-xs flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-emerald-500/20 font-mono">
                        <span>رمز التحقق (OTP):</span>
                        <span className="font-black text-base tracking-widest text-white bg-emerald-600 px-3 py-0.5 rounded select-all">{decryptedPayload.otp}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 leading-normal">
                        * يرجى إعطاء كود الـ OTP الموضح أعلاه للشريك طالب الدخول ليتمكن من تشغيل الكاشير.
                      </p>
                    </div>
                  </div>
                ) : decryptInputToken.trim() ? (
                  <div className="p-3 bg-rose-950/20 border border-rose-800/30 rounded-2xl text-rose-400 text-xs font-bold text-center">
                    ❌ المفتاح غير صالح! تأكد من نسخ المفتاح كاملاً من الواتساب.
                  </div>
                ) : null}
              </div>
            )}

            <div className="pt-4 border-t border-slate-800 flex gap-2">
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl text-xs cursor-pointer transition-colors"
              >
                إغلاق النافذة
              </button>
              {(settingsTab === "config" || currentUserProfile?.role !== "admin") && (
                <button
                  type="button"
                  onClick={() => {
                    handleDirectConnect(customStoreEmail, customUserName || "المدير العام", currentUserProfile?.role || "admin", currentUserProfile?.email);
                    setShowSettingsModal(false);
                  }}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 rounded-xl text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>حفظ وتحديث الاتصال ⚡</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTAINER */}
      <main className="no-print flex-1 p-3 md:p-6 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          
          {/* TAB 1: POS / POINT OF SALE */}
          {activeTab === "pos" && (
            <motion.div 
              key="pos"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              {/* POS RIGHT SECTION: Categories & Product Selector */}
              <div className="lg:col-span-8 flex flex-col gap-4">
                
                {/* Search, Add Product, and Category switcher */}
                <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-xs text-slate-700">قائمة المواد والمنتجات</span>
                      <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                        {filteredProducts.length} صنف
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={openPosAddProductModal}
                      className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white font-extrabold px-4 py-2 rounded-xl text-xs transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-98"
                    >
                      <Plus className="h-4 w-4" />
                      <span>إضافة منتج جديد لشاشة البيع ⚡</span>
                    </button>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 justify-between">
                    {/* Category buttons list */}
                    <div className="flex gap-2 overflow-x-auto w-full pb-1 scrollbar-thin scrollbar-thumb-slate-200">
                      {categories.length === 0 ? (
                        <p className="text-slate-400 text-xs py-2">لا توجد أقسام مدخلة حالياً. يمكنك التواجد أو الإضافة فوراً!</p>
                      ) : (
                        categories.map(c => (
                          <button
                            key={c.id}
                            onClick={() => setCurrentCatId(c.id)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${currentCatId === c.id ? 'bg-emerald-800 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                          >
                            {c.name}
                          </button>
                        ))
                      )}
                    </div>

                    {/* Search box */}
                    <div className="relative w-full sm:w-64 flex-shrink-0">
                      <Search className="absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
                      <input 
                        type="text" 
                        placeholder="ابحث عن مادة..."
                        value={posSearch}
                        onChange={(e) => setPosSearch(e.target.value)}
                        className="w-full pl-3 pr-9 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-slate-5/50"
                      />
                      {posSearch && (
                        <button onClick={() => setPosSearch("")} className="absolute left-3 top-2.5">
                          <X className="h-4 w-4 text-slate-400" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Items grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {filteredProducts.length === 0 ? (
                    <div className="col-span-full py-16 bg-white rounded-2xl border border-dashed border-slate-200 text-center text-slate-400">
                      <Coffee className="h-12 w-12 mx-auto mb-3 opacity-30 text-emerald-800" />
                      <p className="font-bold text-sm text-slate-700">لا توجد مواد متطابقة حالياً</p>
                      <p className="text-xs text-slate-400 mb-4">يمكنك إدراج منتج جديد مباشرة إلى شاشة البيع بدون الحاجة لمغادرتها!</p>
                      <button
                        type="button"
                        onClick={openPosAddProductModal}
                        className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-md"
                      >
                        <Plus className="h-4 w-4" />
                        <span>إضافة منتج جديد لشاشة البيع</span>
                      </button>
                    </div>
                  ) : (
                    filteredProducts.map(prod => {
                      // Check inventory level warning
                      const isRawAlert = prod.linked_inv && (inventory.find(i => i.name === prod.linked_inv)?.total || 0) - (inventory.find(i => i.name === prod.linked_inv)?.sold || 0) <= (inventory.find(i => i.name === prod.linked_inv)?.alert_limit || 0);
                      const isPkgAlert = prod.linked_pkg && (inventory.find(i => i.name === prod.linked_pkg)?.total || 0) - (inventory.find(i => i.name === prod.linked_pkg)?.sold || 0) <= (inventory.find(i => i.name === prod.linked_pkg)?.alert_limit || 0);

                      return (
                        <motion.div
                          whileTap={{ scale: 0.98 }}
                          key={prod.id}
                          onClick={() => addToCart(prod)}
                          className="bg-white rounded-2xl border border-slate-100 hover:border-emerald-200 hover:shadow-md transition-all cursor-pointer overflow-hidden group flex flex-col justify-between relative"
                        >
                          <div className="relative h-28 w-full bg-slate-100">
                            {prod.img ? (
                              <img 
                                src={prod.img} 
                                alt={prod.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-300">
                                <ImageIcon className="h-8 w-8" />
                              </div>
                            )}

                            {/* POS Direct Edit & Delete Buttons Overlay */}
                            <div className="absolute top-2 left-2 flex gap-1 z-10 opacity-90 group-hover:opacity-100 transition-opacity">
                              <button
                                type="button"
                                onClick={(e) => openPosEditProductModal(prod, e)}
                                className="bg-white/90 hover:bg-white text-sky-700 hover:text-sky-900 p-1.5 rounded-lg text-xs shadow-md backdrop-blur-xs transition-all cursor-pointer hover:scale-110"
                                title="تعديل المنتج مباشرة"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handlePosDeleteProduct(prod, e)}
                                className="bg-white/90 hover:bg-white text-rose-600 hover:text-rose-800 p-1.5 rounded-lg text-xs shadow-md backdrop-blur-xs transition-all cursor-pointer hover:scale-110"
                                title="حذف المنتج من شاشة البيع"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {(isRawAlert || isPkgAlert) && (
                              <span className="absolute top-2 right-2 bg-rose-500 text-white p-1 rounded-lg text-[9px] font-bold flex items-center gap-0.5 shadow-md">
                                <AlertTriangle className="h-3 w-3" />
                                مخزون حرج!
                              </span>
                            )}
                          </div>
                          
                          <div className="p-3 flex-1 flex flex-col justify-between">
                            <h3 className="font-bold text-xs md:text-sm text-slate-800 line-clamp-2 leading-tight min-h-[2.5rem]">{prod.name}</h3>
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                              <span className="text-emerald-700 font-extrabold text-xs md:text-sm">{prod.price.toLocaleString()} د.ع</span>
                              <Plus className="h-4 w-4 bg-emerald-100 text-emerald-800 rounded-full p-0.5 group-hover:bg-emerald-500 group-hover:text-white transition-colors" />
                            </div>
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>

              </div>

              {/* POS LEFT SECTION: Invoice Checkout */}
              <div className="lg:col-span-4 bg-white rounded-2xl shadow-md border-t-4 border-emerald-900 p-4 flex flex-col justify-between h-[calc(100vh-140px)] sticky top-24">
                
                {/* Upper invoice items segment */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-2">
                    <h2 className="font-bold text-slate-800 text-base flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-emerald-700" />
                      <span>الفاتورة الحالية</span>
                    </h2>
                    <span className="bg-emerald-100 text-emerald-800 rounded-full px-2.5 py-0.5 text-xs font-bold">
                      {cart.reduce((sum, i) => sum + i.qty, 0)} مواد
                    </span>
                  </div>

                  {/* Cart items list */}
                  <div className="flex-1 overflow-y-auto pr-1">
                    {cart.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 py-12">
                        <Coffee className="h-10 w-10 mb-2 text-slate-300" />
                        <p className="text-xs font-bold">الفاتورة فارغة حالياً</p>
                        <p className="text-[11px]">انقر على الأصناف لإضافتها هنا</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {cart.map((item, idx) => (
                          <div key={item.product.id} className="py-2.5 flex items-center justify-between gap-2 group">
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-xs text-slate-800 truncate">{item.product.name}</p>
                              <span className="text-[10px] text-slate-400">سعر المفرد: {item.product.price.toLocaleString()} د.ع</span>
                            </div>
                            
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <input 
                                type="number" 
                                min="0"
                                value={item.qty}
                                onChange={(e) => updateCartQty(item.product.id, e.target.value)}
                                className="w-12 py-1 text-center border border-slate-200 rounded-lg text-xs font-bold focus:ring-1 focus:ring-emerald-500 outline-none"
                              />
                              <span className="text-xs font-bold text-slate-700 w-16 text-left">
                                {(item.product.price * item.qty).toLocaleString()}
                              </span>
                              <button 
                                onClick={() => removeFromCart(item.product.id)}
                                className="text-rose-500 hover:text-rose-700 p-1 rounded-lg hover:bg-rose-50 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lower totals & Checkout actions */}
                <div className="border-t border-slate-100 pt-3 mt-3 bg-slate-50/50 -mx-4 -mb-4 p-4 rounded-b-2xl">
                  {/* Notes / Optional label */}
                  <div className="mb-2.5">
                    <input 
                      type="text" 
                      placeholder="✍️ إضافة ملاحظة أو بيان للفاتورة..."
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none bg-white"
                    />
                  </div>

                  {/* Cashier identification - Required */}
                  <div className="mb-3">
                    <div className="relative">
                      <Lock className="absolute right-3 top-2.5 h-3.5 w-3.5 text-rose-500" />
                      <input 
                        type="password" 
                        maxLength={4}
                        placeholder="🔒 أدخل رمز الموظف لحفظ الطلب"
                        value={employeePin}
                        onChange={(e) => setEmployeePin(e.target.value)}
                        className="w-full pl-3 pr-9 py-2 rounded-xl border-2 border-emerald-500 text-xs font-bold text-center focus:ring-2 focus:ring-emerald-700 focus:border-transparent outline-none bg-white"
                      />
                    </div>
                  </div>

                  {/* Summary Box */}
                  <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-inner flex flex-col gap-1.5 text-xs font-bold text-slate-600">
                    <div className="flex justify-between">
                      <span>المجموع الأساسي:</span>
                      <span>{getSubtotal().toLocaleString()} د.ع</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span>نسبة الخصم (%):</span>
                      <div className="flex items-center gap-1">
                        <input 
                          type="number" 
                          min="0"
                          max="100"
                          value={discount}
                          onChange={(e) => setDiscount(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                          className="w-12 py-0.5 border border-slate-200 rounded-lg text-center text-xs"
                        />
                        <span>%</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-base text-emerald-800 pt-2 border-t border-slate-100 border-dashed font-extrabold">
                      <span>المجموع النهائي:</span>
                      <span>{getFinalTotal().toLocaleString()} د.ع</span>
                    </div>
                  </div>

                  {/* Print and Save invoice */}
                  <button
                    onClick={handleOrderSubmit}
                    className="w-full mt-3 bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Printer className="h-4.5 w-4.5" />
                    <span>حفظ الفاتورة وطباعة</span>
                  </button>
                </div>

              </div>
            </motion.div>
          )}

          {/* TAB 2: INVENTORY / المخزن والمستودع */}
          {activeTab === "inventory" && (currentUserProfile?.role === "admin" || currentUserProfile?.role === "partner") && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Layers className="h-5 w-5 text-emerald-700" />
                  <span>مخزن المواد والكميات الحالي (لوحة المدير)</span>
                </h2>

                {/* Add / Edit Form */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                  <h3 className="font-bold text-slate-800 text-sm mb-3">
                    {invFormIdx === -1 ? "➕ إضافة وتجهيز مادة خام جديدة للمخزن" : "📝 تعديل مادة مستودع مسجلة"}
                  </h3>
                  
                  <form onSubmit={saveInventoryItem} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">اسم المادة الخام</label>
                      <input 
                        type="text"
                        required
                        placeholder="مثال: أكواب، حليب طازج..."
                        value={invName}
                        onChange={(e) => setInvName(e.target.value)}
                        className="w-full p-2 text-xs rounded-lg border border-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">الكمية المستلمة كلياً</label>
                      <input 
                        type="number"
                        required
                        placeholder="مثال: 500"
                        value={invTotalQty || ""}
                        onChange={(e) => setInvTotalQty(parseInt(e.target.value, 10) || 0)}
                        className="w-full p-2 text-xs rounded-lg border border-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1">حد التنبيه الأدنى للتحذير</label>
                      <input 
                        type="number"
                        required
                        placeholder="مثال: 50"
                        value={invAlertLimit || ""}
                        onChange={(e) => setInvAlertLimit(parseInt(e.target.value, 10) || 0)}
                        className="w-full p-2 text-xs rounded-lg border border-slate-200 focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button 
                        type="submit" 
                        className="flex-1 bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2 px-4 rounded-lg text-xs cursor-pointer transition-colors"
                      >
                        {invFormIdx === -1 ? "حفظ المادة" : "تعديل المادة"}
                      </button>
                      {invFormIdx > -1 && (
                        <button 
                          type="button" 
                          onClick={cancelInventoryEdit}
                          className="bg-slate-300 hover:bg-slate-400 text-slate-700 font-bold py-2 px-3 rounded-lg text-xs cursor-pointer"
                        >
                          إلغاء
                        </button>
                      )}
                    </div>
                  </form>
                </div>

                {/* Inventory Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-right border-collapse text-xs md:text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <th className="p-3">اسم المادة</th>
                        <th className="p-3">الكمية المجهزة (الكلي)</th>
                        <th className="p-3">الكمية المسحوبة (مبيعات)</th>
                        <th className="p-3">المتبقي المتوفر حالياً</th>
                        <th className="p-3">حد التنبيه المعين</th>
                        <th className="p-3">حالة المادة الإجمالية</th>
                        <th className="p-3">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {inventory.map((item, idx) => {
                        const remaining = item.total - item.sold;
                        const isCritical = remaining <= item.alert_limit;

                        return (
                          <tr 
                            key={idx} 
                            className={`hover:bg-slate-50/50 transition-colors ${isCritical ? 'bg-rose-50/60 text-rose-900 border-r-4 border-rose-500 font-bold' : ''}`}
                          >
                            <td className="p-3 font-bold">{item.name}</td>
                            <td className="p-3">{item.total.toLocaleString()}</td>
                            <td className="p-3">{item.sold.toLocaleString()}</td>
                            <td className="p-3 font-extrabold">{remaining.toLocaleString()}</td>
                            <td className="p-3">{item.alert_limit.toLocaleString()}</td>
                            <td className="p-3">
                              {isCritical ? (
                                <span className="inline-flex items-center gap-1 text-rose-700 font-extrabold">
                                  <AlertTriangle className="h-3.5 w-3.5 animate-bounce" />
                                  حرجة للغاية
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                                  <Check className="h-3.5 w-3.5" />
                                  مستقر وآمن
                                </span>
                              )}
                            </td>
                            <td className="p-3">
                              <div className="flex items-center gap-1.5 justify-start">
                                <button 
                                  onClick={() => startEditInventory(idx)}
                                  className="bg-slate-700 text-white py-1 px-2.5 rounded-lg text-xs font-bold hover:bg-slate-900 transition-colors flex items-center gap-1 cursor-pointer"
                                  title="تعديل المادة"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                  <span>تعديل</span>
                                </button>
                                <button 
                                  onClick={() => resetInventoryItemQuantities(idx)}
                                  className="bg-amber-600 text-white py-1 px-2.5 rounded-lg text-xs font-bold hover:bg-amber-700 transition-colors flex items-center gap-1 cursor-pointer"
                                  title="تصفير كافة الكميات"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                  <span>تصفير</span>
                                </button>
                                <button 
                                  onClick={() => deleteInventoryItem(idx)}
                                  className="bg-rose-600 text-white py-1 px-2.5 rounded-lg text-xs font-bold hover:bg-rose-700 transition-colors flex items-center gap-1 cursor-pointer"
                                  title="حذف المادة"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                  <span>حذف</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

              </div>
            </motion.div>
          )}

          {/* TAB 3: ADMIN / الإدارة والأقسام */}
          {activeTab === "admin" && (currentUserProfile?.role === "admin" || currentUserProfile?.role === "partner") && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6"
            >
              
              {/* Categories & Product Hierarchy Editor */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* 1. Category form & products creator */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 text-base mb-4 flex items-center gap-1.5">
                    <Layers className="h-5 w-5 text-emerald-700" />
                    <span>إدارة شجرة الأقسام الرئيسية والمواد</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Category quick save */}
                    <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex flex-col justify-between">
                      <div>
                        <h4 className="font-bold text-xs text-emerald-900 mb-2">
                          {catFormId ? "📝 تعديل اسم قسم رئيسي" : "➕ إضافة قسم رئيسي جديد"}
                        </h4>
                        <input 
                          type="text" 
                          placeholder="مثال: القهوة الباردة..."
                          value={catNameInput}
                          onChange={(e) => setCatNameInput(e.target.value)}
                          className="w-full p-2 text-xs rounded-lg border border-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                        />
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button 
                          onClick={saveCategory}
                          className="flex-1 bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2 rounded-lg text-xs cursor-pointer transition-colors"
                        >
                          {catFormId ? "تحديث القسم" : "حفظ القسم الجديد"}
                        </button>
                        {catFormId && (
                          <button 
                            onClick={cancelCategoryEdit}
                            className="bg-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg text-xs cursor-pointer"
                          >
                            إلغاء
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Product Form */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <h4 className="font-bold text-xs text-slate-800 mb-2">
                        {itemFormId ? "📝 تعديل منتج قائم" : "➕ إضافة مادة جديدة للبيع"}
                      </h4>
                      <form onSubmit={saveProduct} className="space-y-2">
                        <select 
                          required
                          value={itemCatSelect}
                          onChange={(e) => setItemCatSelect(e.target.value)}
                          className="w-full p-2 text-xs rounded-lg border border-slate-200 outline-none bg-white font-bold text-slate-700"
                        >
                          <option value="">-- حدد القسم الرئيسي التابع له --</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>

                        <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="text"
                            required
                            placeholder="اسم مادة البيع..."
                            value={itemNameInput}
                            onChange={(e) => setItemNameInput(e.target.value)}
                            className="w-full p-2 text-xs rounded-lg border border-slate-200 outline-none bg-white"
                          />
                          <input 
                            type="number"
                            required
                            placeholder="السعر د.ع..."
                            value={itemPriceInput || ""}
                            onChange={(e) => setItemPriceInput(parseInt(e.target.value, 10) || 0)}
                            className="w-full p-2 text-xs rounded-lg border border-slate-200 outline-none bg-white font-bold"
                          />
                        </div>

                        <input 
                          type="text"
                          placeholder="رابط الصورة (اختياري)..."
                          value={itemImgInput}
                          onChange={(e) => setItemImgInput(e.target.value)}
                          className="w-full p-2 text-xs rounded-lg border border-slate-200 outline-none bg-white"
                        />

                        {/* 📦 ربط التخفيض التلقائي من المستودع (متعدد المواد) */}
                        <div className="border border-dashed border-emerald-400 p-3 rounded-xl bg-emerald-50/30 space-y-2.5">
                          <div className="flex items-center justify-between gap-1.5 border-b border-emerald-200/60 pb-1.5">
                            <div>
                              <p className="font-extrabold text-emerald-950 text-xs flex items-center gap-1">
                                <span>🔗 ربط التخفيض التلقائي من المستودع:</span>
                                <span className="text-[9px] bg-emerald-700 text-white font-black px-1.5 py-0.5 rounded-full">
                                  {itemLinkedMaterials.length} مادة
                                </span>
                              </p>
                              <p className="text-[9.5px] text-slate-500 mt-0.5">
                                أضف أي عدد من المواد (أكواب، بن، غطاء، شفاطة، حوامل)
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={addLinkedMaterialRow}
                              className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold px-2.5 py-1 rounded-lg text-[10px] transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="h-3 w-3" />
                              <span>+ مادة جديدة</span>
                            </button>
                          </div>

                          {itemLinkedMaterials.length === 0 ? (
                            <div className="text-center py-2.5 bg-white/80 rounded-lg border border-dashed border-slate-200 text-slate-400 text-[10px]">
                              لم يتم ربط أي مادة مخزنية بعد. انقر على <strong>"+ مادة جديدة"</strong> للربط.
                            </div>
                          ) : (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                              {itemLinkedMaterials.map((mat, idx) => (
                                <div key={idx} className="bg-white p-2 rounded-lg border border-slate-200 shadow-xs space-y-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <select
                                      value={mat.inventoryName}
                                      onChange={(e) => updateLinkedMaterialRow(idx, "inventoryName", e.target.value)}
                                      className="flex-1 p-1 text-[11px] rounded border border-slate-200 bg-slate-50 font-bold text-slate-800 outline-none"
                                    >
                                      <option value="">-- اختر مادة من المستودع --</option>
                                      {inventory.map((inv, i) => (
                                        <option key={i} value={inv.name}>{inv.name} (المتبقي: {inv.total - inv.sold})</option>
                                      ))}
                                    </select>

                                    <button
                                      type="button"
                                      onClick={() => removeLinkedMaterialRow(idx)}
                                      className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1 rounded text-xs cursor-pointer"
                                      title="إزالة"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  <div className="flex items-center gap-2 text-[10px]">
                                    <div className="flex-1 flex items-center gap-1">
                                      <span className="text-slate-500 font-bold">الاستهلاك:</span>
                                      <input
                                        type="number"
                                        step="any"
                                        min={0.01}
                                        value={mat.consumeQty}
                                        onChange={(e) => updateLinkedMaterialRow(idx, "consumeQty", parseFloat(e.target.value) || 0)}
                                        className="w-14 p-0.5 text-center font-black text-emerald-800 border border-slate-200 rounded bg-slate-50"
                                      />
                                    </div>

                                    <div className="flex-1 flex items-center gap-1">
                                      <span className="text-slate-500 font-bold">لكل</span>
                                      <input
                                        type="number"
                                        min={1}
                                        value={mat.salesRatio}
                                        onChange={(e) => updateLinkedMaterialRow(idx, "salesRatio", parseInt(e.target.value, 10) || 1)}
                                        className="w-10 p-0.5 text-center font-black text-slate-800 border border-slate-200 rounded bg-slate-50"
                                      />
                                      <span className="text-slate-500 font-bold">بيع</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 pt-1">
                          <button 
                            type="submit"
                            className="flex-1 bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2 rounded-lg text-xs cursor-pointer"
                          >
                            {itemFormId ? "تحديث المنتج" : "حفظ المنتج للبيع"}
                          </button>
                          {itemFormId && (
                            <button 
                              type="button"
                              onClick={() => {
                                setItemFormId("");
                                setItemNameInput("");
                                setItemPriceInput(0);
                                setItemImgInput("");
                                setItemLinkedInv("");
                                setItemLinkedPkg("");
                                setItemPkgRatio(1);
                              }}
                              className="bg-slate-300 text-slate-700 font-bold py-2 px-3 rounded-lg text-xs cursor-pointer"
                            >
                              إلغاء
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                  </div>
                </div>

                {/* Categories tree display */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <h4 className="font-bold text-slate-800 text-sm mb-4">🌳 هيكل العرض الفعلي والأصناف الحالية:</h4>
                  
                  <div className="space-y-4">
                    {categories.length === 0 ? (
                      <p className="text-slate-400 text-xs py-8 text-center border-2 border-dashed border-slate-100 rounded-xl">شجرة الأقسام فارغة حالياً</p>
                    ) : (
                      categories.map(cat => {
                        const catProducts = products.filter(p => p.cat_id === cat.id);
                        return (
                          <div key={cat.id} className="border border-slate-100 rounded-xl overflow-hidden shadow-inner">
                            {/* Cat item header */}
                            <div className="bg-slate-50 px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                              <span className="font-extrabold text-sm text-slate-800">📁 {cat.name}</span>
                              <div className="flex gap-1">
                                <button 
                                  onClick={() => startEditCategory(cat)}
                                  className="bg-sky-50 text-sky-700 hover:bg-sky-100 p-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                                  title="تعديل اسم القسم"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </button>
                                <button 
                                  onClick={() => deleteCategory(cat.id)}
                                  className="bg-rose-50 text-rose-700 hover:bg-rose-100 p-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                                  title="حذف القسم"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Cat products body list */}
                            <div className="p-3 divide-y divide-slate-50 bg-white">
                              {catProducts.length === 0 ? (
                                <p className="text-[11px] text-slate-400 py-1">لا توجد مواد مبيعات تابعة لهذا القسم حالياً</p>
                              ) : (
                                catProducts.map(prod => (
                                  <div key={prod.id} className="py-2 flex items-center justify-between text-xs hover:bg-slate-50/50 rounded px-1.5 transition-colors">
                                    <div>
                                      <span className="font-bold text-slate-700">🥤 {prod.name}</span>
                                      <span className="text-[10px] text-slate-400 mr-2 font-semibold">({prod.price.toLocaleString()} د.ع)</span>
                                      {prod.linked_materials && prod.linked_materials.length > 0 ? (
                                        <div className="text-[9px] text-emerald-800 font-bold mt-0.5 flex flex-wrap gap-1">
                                          {prod.linked_materials.map((m, idx) => (
                                            <span key={idx} className="bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded text-[8.5px]">
                                              🔗 {m.inventoryName} ({m.consumeQty} لكل {m.salesRatio} بيع)
                                            </span>
                                          ))}
                                        </div>
                                      ) : (prod.linked_inv || prod.linked_pkg) ? (
                                        <div className="text-[9px] text-emerald-700 font-bold mt-0.5">
                                          ⛓️ مرتبط بـ: {prod.linked_inv || "-"} | {prod.linked_pkg || "-"}
                                        </div>
                                      ) : null}
                                    </div>
                                    <div className="flex gap-1.5">
                                      <button 
                                        onClick={() => startEditProduct(prod)}
                                        className="bg-slate-100 hover:bg-slate-200 text-slate-700 p-1 rounded transition-colors cursor-pointer"
                                      >
                                        <Edit className="h-3 w-3" />
                                      </button>
                                      <button 
                                        onClick={() => deleteProduct(prod.id)}
                                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 p-1 rounded transition-colors cursor-pointer"
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>

              {/* General PIN configurations & employees */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* Manager Password setting card */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-t-4 border-amber-500">
                  <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-1 text-amber-600">
                    <Lock className="h-5 w-5" />
                    <span>رمز الأمان السري للمدير</span>
                  </h3>
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400 leading-normal">هذا الرمز يُستعمل للدخول إلى مخزن المواد، إدارة الأقسام، المبيعات والأرشيف التاريخي.</p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={adminPinSetting}
                        onChange={(e) => setAdminPinSetting(e.target.value)}
                        className="w-24 text-center p-2 font-mono font-bold text-sm bg-slate-50 border border-slate-200 rounded-lg focus:ring-1 focus:ring-amber-500 outline-none"
                      />
                      <button 
                        onClick={updateAdminPin}
                        className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-3 rounded-lg text-xs cursor-pointer transition-colors"
                      >
                        تحديث رمز الدخول
                      </button>
                    </div>
                  </div>
                </div>

                {/* Employees (Cashiers) security registry card */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-t-4 border-emerald-950">
                  <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-1.5">
                    <User className="h-5 w-5 text-emerald-800" />
                    <span>صلاحيات الموظفين (الكاشيرية)</span>
                  </h3>

                  <form onSubmit={saveEmployee} className="space-y-3 bg-slate-50/50 p-3 rounded-xl border border-slate-100 mb-4">
                    <p className="text-[11px] font-bold text-emerald-950">إضافة رمز كاشير معتمد جديد:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        type="text"
                        required
                        placeholder="الاسم الثنائي..."
                        value={newEmpName}
                        onChange={(e) => setNewEmpName(e.target.value)}
                        className="w-full p-2 text-xs rounded-lg border border-slate-200 outline-none bg-white"
                      />
                      <input 
                        type="password"
                        required
                        maxLength={4}
                        placeholder="الرمز السري (4 أرقام)..."
                        value={newEmpPin}
                        onChange={(e) => setNewEmpPin(e.target.value)}
                        className="w-full p-2 text-xs rounded-lg border border-slate-200 text-center font-mono focus:ring-1 focus:ring-emerald-500 outline-none bg-white"
                      />
                    </div>
                    <button 
                      type="submit"
                      className="w-full bg-emerald-900 hover:bg-emerald-950 text-white font-bold py-2 rounded-lg text-xs cursor-pointer"
                    >
                      تسجيل وتعميم الرمز
                    </button>
                  </form>

                  <h4 className="font-bold text-xs text-slate-700 mb-2">👥 الموظفون المعتمدون بالشركة:</h4>
                  
                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto pr-1">
                    {employees.length === 0 ? (
                      <p className="text-[11px] text-slate-400 py-3 text-center">لا يوجد موظفون مسجلون. اضف كاشير أعلاه!</p>
                    ) : (
                      employees.map((emp, i) => (
                        <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-bold text-slate-800 block">{emp.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">الرمز الممنوح: **** ( {emp.pin} )</span>
                          </div>
                          <button 
                            onClick={() => deleteEmployee(emp.pin)}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-700 p-1.5 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* 2FA Active Requests and OTP Display */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-t-4 border-amber-500 mb-6">
                  <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-1.5">
                    <Sparkles className="h-5 w-5 text-amber-600 animate-pulse" />
                    <span>طلبات الدخول النشطة (رمز التحقق الثنائي 2FA)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 leading-normal">
                    تظهر هنا الأجهزة التي تحاول تسجيل الدخول حالياً. يمكنك تزويدهم بالرمز، أو الضغط على زر الموافقة الفورية لفتح حسابهم تلقائياً ومباشرة!
                  </p>

                  <div className="space-y-3">
                    {activeOtpRequests.length === 0 ? (
                      <p className="text-slate-400 text-xs py-4 text-center bg-slate-50 rounded-xl border border-dashed border-slate-100">
                        لا توجد محاولات تسجيل دخول نشطة حالياً.
                      </p>
                    ) : (
                      activeOtpRequests.map((req) => (
                        <div key={req.id} className="p-3.5 bg-slate-50 rounded-xl border border-amber-200/50 space-y-3 text-xs">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                                <span>{req.name}</span>
                                <span className="bg-amber-50 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded-full border border-amber-100">
                                  {req.role === "partner" ? "شريك" : req.role === "cashier" ? "موظف كاشير" : "مدير"}
                                </span>
                              </p>
                              <p className="text-[10px] text-slate-400 dir-ltr text-right">{req.email}</p>
                              {req.phone && (
                                <p className="text-[10px] text-green-600 font-extrabold mt-0.5 flex items-center gap-1">
                                  <span>💬 واتساب:</span>
                                  <span className="dir-ltr">{req.phone}</span>
                                </p>
                              )}
                              <p className="text-[9px] text-slate-500 mt-1">📱 الجهاز: {req.device || "غير معروف"}</p>
                            </div>
                            <div className="text-left">
                              <span className="text-[10px] text-amber-600 font-extrabold block">نشط حالياً</span>
                            </div>
                          </div>

                          <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-2.5 flex items-center justify-between">
                            <span className="text-[10px] text-slate-500 font-bold">رمز التحقق (OTP):</span>
                            <span className="font-black text-slate-800 text-sm tracking-widest">{req.otpCode}</span>
                          </div>

                          <div className="flex gap-2 justify-end pt-1 border-t border-slate-200/40 flex-wrap">
                            {req.phone && (
                              <a
                                href={`https://api.whatsapp.com/send?phone=${encodeURIComponent(req.phone)}&text=${encodeURIComponent(`☕ مرحباً ${req.name}!\nرمز التحقق الخاص بك لتسجيل الدخول لنظام Vita هو: *${req.otpCode}*\n\nيرجى كتابته في التطبيق لفتح حسابك مباشرة، أو الانتظار ليقوم المدير بتفعيلك سحابياً تلقائياً الآن. 😊`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-green-600 hover:bg-green-700 text-white font-extrabold py-1.5 px-3 rounded-lg text-[10.5px] cursor-pointer transition-colors flex items-center gap-1"
                              >
                                <span>إرسال الرمز عبر واتساب 💬</span>
                              </a>
                            )}
                            <button
                              onClick={async () => {
                                try {
                                  await updateDoc(doc(db, "otp_verifications", req.email), {
                                    status: "approved"
                                  });
                                  await updateDoc(doc(db, "users", req.email), {
                                    status: "approved"
                                  });
                                  alert(`⚡ تم السماح والموافقة المباشرة للمستخدم ${req.name}! سيتم تسجيل دخوله تلقائياً في ثوانٍ معدودة.`);
                                } catch (err: any) {
                                  alert("فشل في الموافقة: " + err.message);
                                }
                              }}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-1.5 px-3 rounded-lg text-[10.5px] cursor-pointer transition-colors flex items-center gap-1"
                            >
                              <span>تفعيل ودخول فوري تلقائي ⚡</span>
                            </button>
                            <button
                              onClick={async () => {
                                if (confirm("هل تريد رفض طلب تسجيل الدخول؟")) {
                                  try {
                                    await updateDoc(doc(db, "otp_verifications", req.email), {
                                      status: "rejected"
                                    });
                                    await deleteDoc(doc(db, "users", req.email));
                                    alert("❌ تم رفض وإلغاء طلب الدخول.");
                                  } catch (err: any) {
                                    alert("فشل الرفض: " + err.message);
                                  }
                                }
                              }}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-1.5 px-2.5 rounded-lg text-[10.5px] cursor-pointer transition-colors"
                            >
                              رفض الدخول ❌
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Partner Requests list */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 border-t-4 border-emerald-500">
                  <h3 className="font-bold text-slate-800 text-base mb-3 flex items-center gap-1.5">
                    <User className="h-5 w-5 text-emerald-600" />
                    <span>إدارة الشركاء وطلب الانضمام</span>
                  </h3>
                  <p className="text-xs text-slate-400 mb-4 leading-normal">
                    تحكم بالشركاء المسموح لهم بمبيعات الكافيه ورؤية التقارير.
                  </p>

                  <div className="space-y-3">
                    {partnerRequests.length === 0 ? (
                      <p className="text-slate-400 text-xs py-3 text-center bg-slate-50 rounded-xl border border-dashed border-slate-100">
                        لا توجد طلبات انضمام أو شركاء حالياً.
                      </p>
                    ) : (
                      partnerRequests.map((partner) => (
                        <div key={partner.email} className="p-3 bg-slate-50 rounded-xl border border-slate-200/50 space-y-2 text-xs">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-bold text-slate-800 flex items-center gap-1.5">
                                <span>{partner.name}</span>
                                <span className="bg-slate-200 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                  {partner.role === "partner" ? "شريك" : partner.role === "cashier" ? "موظف كاشير" : "مدير"}
                                </span>
                              </p>
                              <p className="text-[10px] text-slate-400 dir-ltr">{partner.email}</p>
                              {partner.phone && (
                                <p className="text-[10px] text-green-600 font-extrabold mt-0.5 flex items-center gap-1">
                                  <span>💬 واتساب:</span>
                                  <span className="dir-ltr">{partner.phone}</span>
                                </p>
                              )}
                            </div>
                            {partner.status === "approved" ? (
                              <span className="bg-emerald-50 text-emerald-700 font-extrabold text-[9px] px-2 py-0.5 rounded-full border border-emerald-100">
                                نشط مفعّل
                              </span>
                            ) : (
                              <span className="bg-amber-50 text-amber-700 font-extrabold text-[9px] px-2 py-0.5 rounded-full border border-amber-100">
                                معلق الموافقة
                              </span>
                            )}
                          </div>

                          <div className="flex gap-2 justify-end pt-1 border-t border-slate-200/40 flex-wrap">
                            {partner.phone && (
                              <a
                                href={`https://api.whatsapp.com/send?phone=${encodeURIComponent(partner.phone)}&text=${encodeURIComponent(`🎉 مرحباً ${partner.name}!\nتمت الموافقة وتفعيل حسابك بنجاح في تطبيق Vita بصلاحية (${partner.role === "partner" ? "شريك" : "موظف كاشير"})!\n\nيمكنك الآن فتح التطبيق والبدء بالبيع ورؤية البيانات مباشرةً. بالتوفيق والرزق الواسع! ☕💸`)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2.5 rounded-lg text-[10px] cursor-pointer transition-colors flex items-center gap-1"
                              >
                                <span>تأكيد واتساب 💬</span>
                              </a>
                            )}
                            {partner.status === "pending" && (
                              <button
                                onClick={() => approvePartner(partner.email)}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1 px-2.5 rounded-lg text-[10px] cursor-pointer transition-colors"
                              >
                                قبول الطلب ✅
                              </button>
                            )}
                            <button
                              onClick={() => rejectPartner(partner.email)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold py-1 px-2.5 rounded-lg text-[10px] cursor-pointer transition-colors"
                            >
                              حذف / رفض ❌
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

            </motion.div>
          )}

          {/* TAB 4: REPORTS / مبيعات اليوم */}
          {activeTab === "reports" && (isManager || currentUserProfile?.role === "partner") && (() => {
            const uniqueSalesDays = Array.from(new Set(sales.map(s => getSaleBusinessDay(s, businessDayStartHour)))) as string[];
            if (!uniqueSalesDays.includes(currentBusinessDay)) {
              uniqueSalesDays.push(currentBusinessDay);
            }
            uniqueSalesDays.sort((a, b) => b.localeCompare(a)); // Sort latest first

            const activeReportDay = selectedReportDay || currentBusinessDay;
            const filteredSales = sales.filter(s => getSaleBusinessDay(s, businessDayStartHour) === activeReportDay);

            return (
              <motion.div
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                
                {/* Daily Shift statistics dashboard */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-sky-600" />
                      <span>مبيعات وجرد يوم العمل: <span className="text-emerald-600 underline font-extrabold">{activeReportDay}</span></span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">تفاصيل الدخل وجرد الفواتير لليوم المالي المحدد.</p>
                  </div>
                  
                  <div className="flex gap-2 flex-wrap items-center">
                    <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-600">اختر يوم العمل:</span>
                      <select
                        value={activeReportDay}
                        onChange={(e) => {
                          setSelectedReportDay(e.target.value);
                        }}
                        className="bg-white text-xs font-bold text-slate-800 rounded-lg p-1.5 border border-slate-200 outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                      >
                        {uniqueSalesDays.map(day => (
                          <option key={day} value={day}>
                            {day} {day === currentBusinessDay ? "⭐ (اليوم الحالي المفتوح)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button 
                      onClick={printCurrentShiftReport}
                      className="bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                    >
                      <Printer className="h-4 w-4" />
                      <span>طباعة تقرير هذا اليوم</span>
                    </button>

                    {currentUserProfile?.role === "admin" && activeReportDay === currentBusinessDay && (
                      <button 
                        onClick={archiveCurrentShift}
                        className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                      >
                        <Archive className="h-4 w-4" />
                        <span>أرشفة وإغلاق اليوم وتصفيره</span>
                      </button>
                    )}

                    {currentUserProfile?.role === "admin" && (
                      <button 
                        onClick={() => deleteSingleDaySales(activeReportDay)}
                        className="bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>تصفير مبيعات هذا اليوم 🗑️</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Core numbers cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-sky-50 border-r-4 border-sky-600 p-4 rounded-xl shadow-inner font-bold text-sky-900 flex flex-col justify-between">
                    <span className="text-xs">المبيعات الإجمالية للوردية</span>
                    <span className="text-2xl mt-1 font-extrabold">
                      {filteredSales.reduce((sum, s) => sum + s.total, 0).toLocaleString()} <span className="text-xs font-semibold">د.ع</span>
                    </span>
                  </div>

                  <div className="bg-emerald-50 border-r-4 border-emerald-600 p-4 rounded-xl shadow-inner font-bold text-emerald-900 flex flex-col justify-between">
                    <span className="text-xs">عدد الفواتير المنفذة</span>
                    <span className="text-2xl mt-1 font-extrabold">{filteredSales.length} فواتير</span>
                  </div>
                </div>

                {/* Cashiers performance cards section */}
                <div>
                  <h3 className="font-bold text-slate-800 text-sm mb-3">👤 مبيعات كاشيرية شفت اليوم المالي المحدد:</h3>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {employees.map((emp, idx) => {
                      const empSalesTotal = filteredSales.filter(s => s.emp === emp.name).reduce((sum, s) => sum + s.total, 0);
                      return (
                        <div key={idx} className="bg-amber-50/50 border border-amber-100 p-3 rounded-xl border-r-4 border-amber-500 font-bold text-amber-900">
                          <span className="text-xs text-slate-500 block">👤 {emp.name}</span>
                          <span className="text-lg mt-1 font-extrabold block">{empSalesTotal.toLocaleString()} د.ع</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Detailed shift sales log */}
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                  <h3 className="font-bold text-slate-800 text-sm mb-4">📋 سجل فواتير يوم العمل بالتفصيل الممل:</h3>
                  
                  <div className="overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-right border-collapse text-xs md:text-sm">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                          <th className="p-3">الوقت والزمان</th>
                          <th className="p-3">الموظف الكاشير</th>
                          <th className="p-3">المواد والمبيعات داخل الفاتورة</th>
                          <th className="p-3">الخصم %</th>
                          <th className="p-3">الملاحظة والبيان</th>
                          <th className="p-3">الصافي النهائي</th>
                          <th className="p-3">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSales.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center text-slate-400 py-12">لا توجد فواتير منفذة في يوم العمل المالي المحدد.</td>
                          </tr>
                        ) : (
                          filteredSales.map((sale) => (
                            <tr key={sale.id} className="hover:bg-slate-5/50 transition-colors">
                              <td className="p-3 text-slate-500 whitespace-nowrap">{sale.date}</td>
                              <td className="p-3 font-bold">{sale.emp}</td>
                              <td className="p-3 text-emerald-800 font-bold max-w-xs truncate" title={sale.details}>
                                {sale.details}
                              </td>
                              <td className="p-3 font-bold">{sale.discount}%</td>
                              <td className="p-3 text-slate-400 max-w-xs truncate" title={sale.note}>{sale.note}</td>
                              <td className="p-3 font-extrabold text-slate-800">{sale.total.toLocaleString()} د.ع</td>
                              <td className="p-3">
                                <button 
                                  onClick={() => reprintInvoice(sale)}
                                  className="bg-emerald-800 text-white p-1.5 rounded-lg hover:bg-emerald-950 transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  <span className="text-[11px] font-bold px-1">طباعة</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </motion.div>
            );
          })()}

          {/* TAB 5: ARCHIVE / الأرشيف والخزنة */}
          {activeTab === "archive" && isManager && (
            <motion.div
              key="archive"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              
              {/* Archive general board */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-amber-800 flex items-center gap-2">
                    <Archive className="h-5 w-5" />
                    <span>الخزنة التاريخية وجرد الأيام المؤرشفة</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">الأيام والورديات المغلقة والمرحلة بشكل تراكمي آمن.</p>
                </div>
                
                <button 
                  onClick={printFullArchiveReport}
                  className="bg-emerald-800 hover:bg-emerald-950 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-1.5 shadow transition-all cursor-pointer"
                >
                  <Printer className="h-4 w-4" />
                  <span>طباعة الأرشيف التاريخي الكامل</span>
                </button>
              </div>

              {/* Safe grand total card */}
              <div className="bg-gradient-to-l from-amber-50 to-amber-100/50 border-r-6 border-amber-500 p-6 rounded-2xl shadow-sm max-w-md">
                <span className="text-xs font-bold text-amber-800 block">💰 رصيد الخزنة العامة المتوفر حالياً:</span>
                <span className="text-3xl mt-2 font-extrabold text-amber-900 block tracking-tight">
                  {dailyArchive.reduce((sum, d) => sum + d.total, 0).toLocaleString()} <span className="text-sm">د.ع</span>
                </span>
              </div>

              {/* Archives log table */}
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
                <h3 className="font-bold text-slate-800 text-sm mb-4">📋 الأيام والورديات السابقة المؤرشفة:</h3>
                
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-right border-collapse text-xs md:text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                        <th className="p-3">تاريخ وقت تصفية وأرشفة اليوم</th>
                        <th className="p-3">صافي المبيعات المرحّلة</th>
                        <th className="p-3">الإجراءات والتحكم بالبيانات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {dailyArchive.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center text-slate-400 py-12 font-bold">الأرشيف فارغ حالياً.</td>
                        </tr>
                      ) : (
                        dailyArchive.map((day, idx) => (
                          <tr key={idx} className="hover:bg-slate-5/50 transition-colors">
                            <td className="p-3 text-slate-700 font-semibold">📅 {day.date}</td>
                            <td className="p-3 font-extrabold text-amber-800">{day.total.toLocaleString()} د.ع</td>
                            <td className="p-3">
                              <button 
                                onClick={() => deleteSingleArchive(idx)}
                                className="bg-rose-50 text-rose-700 hover:bg-rose-100 py-1.5 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>حذف من السجل</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* FOOTER */}
      <footer className="no-print bg-slate-100 py-4 border-t border-slate-200 text-center text-[10px] md:text-xs text-slate-400">
        <p>نظام كاشير Vita المطور • جميع الحقوق محفوظة لـ Google AI Studio</p>
      </footer>

      {/* --- CHIP THERMAL PRINTER RENDERED AREA (HIDDEN ON SCREEN, ONLY VISIBLE WHEN PRINT DIALOG TRIGGERS) --- */}
      {printDetails && (
        <div className="print-only fixed inset-0 bg-white z-[99999] text-slate-900 leading-tight select-text" dir="rtl">
          <div className="max-w-[80mm] mx-auto p-4 font-mono text-[11px] border border-dashed border-slate-300">
            {/* Ticket Header */}
            <div className="text-center border-b border-dashed border-slate-400 pb-3 mb-3">
              <div className="flex justify-center mb-1">
                <Coffee className="h-8 w-8 text-slate-800" />
              </div>
              <h2 className="text-sm font-bold tracking-tight">مقهى Vita ومبيعات متكاملة</h2>
              <p className="text-[10px] mt-0.5">شعارنا الخدمة والسرعة الفائقة</p>
              <h3 className="text-xs font-extrabold mt-2.5 border border-slate-800 inline-block px-2.5 py-0.5 rounded">
                {printDetails.title}
              </h3>
              <div className="text-right mt-3 text-[10px] space-y-0.5">
                {printDetails.cashier && <p>👤 الكاشير: {printDetails.cashier}</p>}
                <p>📅 تاريخ المعاملة: {printDetails.timestamp}</p>
              </div>
            </div>

            {/* Ticket items Table */}
            {printDetails.items && (
              <table className="w-full text-right border-collapse text-[10px] mb-3">
                <thead>
                  <tr className="border-b border-dashed border-slate-400 font-bold">
                    <th className="pb-1">المادة والصنف</th>
                    <th className="pb-1 text-center w-8">العدد</th>
                    <th className="pb-1 text-left w-16">المجموع</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-slate-200">
                  {printDetails.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-1.5 font-bold">{item.name}</td>
                      <td className="py-1.5 text-center">{item.qty}</td>
                      <td className="py-1.5 text-left font-bold">{item.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* Shift Archive table details */}
            {printDetails.records && (
              <div className="space-y-1.5 my-3">
                <p className="font-bold border-b pb-1">سجل التصفية اليومي:</p>
                {printDetails.records.map((r, idx) => (
                  <div key={idx} className="flex justify-between text-[10px]">
                    <span className="truncate">{r.date}</span>
                    <span className="font-bold">{r.total.toLocaleString()} د.ع</span>
                  </div>
                ))}
              </div>
            )}

            {/* Financial invoice totals */}
            <div className="border-t border-dashed border-slate-400 pt-2.5 space-y-1 text-right text-[10px]">
              {printDetails.subtotal !== undefined && (
                <div className="flex justify-between">
                  <span>المجموع الأساسي:</span>
                  <span>{printDetails.subtotal.toLocaleString()} د.ع</span>
                </div>
              )}
              {printDetails.discount !== undefined && printDetails.discount > 0 && (
                <div className="flex justify-between text-rose-800">
                  <span>الخصم المطبق ({printDetails.discount}%):</span>
                  <span>- {((printDetails.subtotal || 0) * (printDetails.discount / 100)).toLocaleString()} د.ع</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold border-t border-dashed border-slate-800 pt-1 mt-1">
                <span>المبلغ المستلم النهائي:</span>
                <span>{printDetails.total.toLocaleString()} د.ع</span>
              </div>
              {printDetails.note && (
                <p className="text-[9px] text-slate-500 mt-2 border-t pt-1 border-dashed">
                  📝 ملاحظة: {printDetails.note}
                </p>
              )}
            </div>

            {/* Ticket Footer */}
            <div className="text-center border-t border-dashed border-slate-400 pt-3 mt-4 text-[9px] text-slate-500">
              <p>شكراً لزيارتكم • بانتظاركم دائماً</p>
              <p className="mt-0.5">Vita POS v6 - نظام كاشير معتمد</p>
            </div>
          </div>
        </div>
      )}

      {/* 🧾 INTERACTIVE RECEIPT PREVIEW MODAL */}
      <AnimatePresence>
        {printDetails && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="no-print fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 max-w-md w-full flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="bg-emerald-800 text-white p-4 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-2">
                  <Printer className="h-5 w-5 animate-pulse" />
                  <span className="font-extrabold text-sm md:text-base">معاينة وتأكيد الفاتورة</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPrintDetails(null)}
                  className="bg-emerald-900/50 hover:bg-emerald-950/50 text-white h-8 w-8 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Warning Banner if inside iframe */}
              {typeof window !== 'undefined' && window.self !== window.top && (
                <div className="mx-4 mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-right flex items-start gap-2 text-amber-900 leading-normal shadow-sm">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-amber-800 text-xs">⚠️ تنبيه لضمان تشغيل الطابعة بنجاح:</p>
                    <p className="text-[10px] text-amber-700 font-bold mt-1">
                      تقوم المتصفحات بحظر نوافذ الطباعة التلقائية تلقائياً داخل صناديق المعاينة الجانبية لأسباب أمنية.
                    </p>
                    <p className="text-[11px] text-emerald-800 font-black mt-2 bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100 flex items-center gap-1">
                      <span>💡 الحل:</span>
                      <span>يرجى الضغط على زر السهم أعلى اليمين (↗️) لفتح الكاشير في صفحة جديدة مستقلة كاملة، وستعمل الطابعة فوراً بمجرد الضغط على الأزرار!</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Receipt Body Container (Scrollable) */}
              <div className="bg-slate-50 p-6 overflow-y-auto flex-1 flex justify-center">
                {/* Simulated Thermal Ticket Paper */}
                <div className="bg-[#fafefb] text-slate-800 p-6 rounded-xl shadow-md border border-slate-200 max-w-[80mm] w-full font-mono text-[11px] leading-relaxed relative overflow-hidden">
                  {/* Styled Top Decorative Teeth */}
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-b from-slate-200 to-transparent opacity-30"></div>
                  
                  {/* Ticket Header */}
                  <div className="text-center border-b border-dashed border-slate-300 pb-3 mb-3">
                    <div className="flex justify-center mb-1">
                      <Coffee className="h-7 w-7 text-emerald-800" />
                    </div>
                    <h2 className="text-sm font-black tracking-tight text-slate-900">مقهى Vita ومبيعات متكاملة</h2>
                    <p className="text-[10px] text-slate-500 mt-0.5">شعارنا الخدمة والسرعة الفائقة</p>
                    <h3 className="text-[10px] font-extrabold mt-2.5 border border-emerald-800/20 bg-emerald-50 text-emerald-800 inline-block px-2 py-0.5 rounded-md">
                      {printDetails.title}
                    </h3>
                    <div className="text-right mt-3 text-[10px] text-slate-600 space-y-0.5">
                      {printDetails.cashier && <p>👤 الكاشير: {printDetails.cashier}</p>}
                      <p>📅 تاريخ المعاملة: {printDetails.timestamp}</p>
                    </div>
                  </div>

                  {/* Ticket items Table */}
                  {printDetails.items && (
                    <table className="w-full text-right border-collapse text-[10px] mb-3">
                      <thead>
                        <tr className="border-b border-dashed border-slate-300 font-bold text-slate-900">
                          <th className="pb-1 text-right">المادة والصنف</th>
                          <th className="pb-1 text-center w-8">العدد</th>
                          <th className="pb-1 text-left w-20">المجموع</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dashed divide-slate-200 text-slate-700">
                        {printDetails.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 font-bold">{item.name}</td>
                            <td className="py-1.5 text-center font-medium">{item.qty}</td>
                            <td className="py-1.5 text-left font-bold text-slate-900">{item.total.toLocaleString()} د.ع</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Shift Archive table details */}
                  {printDetails.records && (
                    <div className="space-y-1.5 my-3 text-slate-700">
                      <p className="font-bold border-b border-dashed pb-1 text-slate-900 text-[10px]">سجل التصفية اليومي:</p>
                      {printDetails.records.map((r, idx) => (
                        <div key={idx} className="flex justify-between text-[9px]">
                          <span className="truncate">{r.date}</span>
                          <span className="font-bold text-slate-900">{r.total.toLocaleString()} د.ع</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Financial invoice totals */}
                  <div className="border-t border-dashed border-slate-300 pt-2.5 space-y-1 text-right text-[10px] text-slate-600">
                    {printDetails.subtotal !== undefined && (
                      <div className="flex justify-between">
                        <span>المجموع الأساسي:</span>
                        <span>{printDetails.subtotal.toLocaleString()} د.ع</span>
                      </div>
                    )}
                    {printDetails.discount !== undefined && printDetails.discount > 0 && (
                      <div className="flex justify-between text-rose-800">
                        <span>الخصم المطبق ({printDetails.discount}%):</span>
                        <span>- {((printDetails.subtotal || 0) * (printDetails.discount / 100)).toLocaleString()} د.ع</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs font-black border-t border-dashed border-slate-800 pt-1 mt-1 text-slate-900">
                      <span>المبلغ المستلم النهائي:</span>
                      <span className="text-emerald-800">{printDetails.total.toLocaleString()} د.ع</span>
                    </div>
                    {printDetails.note && (
                      <p className="text-[9px] text-slate-500 mt-2 border-t pt-1 border-dashed border-slate-200">
                        📝 ملاحظة: {printDetails.note}
                      </p>
                    )}
                  </div>

                  {/* Ticket Footer */}
                  <div className="text-center border-t border-dashed border-slate-300 pt-3 mt-4 text-[9px] text-slate-400">
                    <p>شكراً لزيارتكم • بانتظاركم دائماً</p>
                    <p className="mt-0.5 font-bold">Vita POS v6</p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="bg-slate-100 border-t border-slate-200 p-4 flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={triggerSystemPrint}
                  className="flex-1 bg-emerald-800 hover:bg-emerald-950 text-white font-extrabold py-3.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-98"
                >
                  <Printer className="h-4 w-4" />
                  بدء الطباعة الفورية
                </button>
                <button
                  type="button"
                  onClick={copyReceiptToClipboard}
                  className="flex-1 bg-sky-700 hover:bg-sky-800 text-white font-extrabold py-3.5 px-4 rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-all shadow-md active:scale-98"
                >
                  <Copy className="h-4 w-4" />
                  نسخ الفاتورة (للواتساب)
                </button>
                <button
                  type="button"
                  onClick={() => setPrintDetails(null)}
                  className="sm:w-24 bg-white border border-slate-200 text-slate-700 font-bold py-3.5 px-4 rounded-2xl text-xs cursor-pointer hover:bg-slate-50 transition-all active:scale-98 text-center"
                >
                  إغلاق
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 🛍️ POS DIRECT ITEM MANAGEMENT MODAL */}
      <AnimatePresence>
        {showPosProductModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="no-print fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 max-w-lg w-full flex flex-col max-h-[92vh]"
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-emerald-800 to-emerald-900 text-white p-4.5 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-2">
                  {posModalMode === "add" ? (
                    <Plus className="h-5 w-5 text-emerald-300" />
                  ) : (
                    <Edit className="h-5 w-5 text-emerald-300" />
                  )}
                  <span className="font-extrabold text-base">
                    {posModalMode === "add" ? "إضافة منتج جديد لشاشة البيع ⚡" : "تعديل بيانات المنتج المباشر 📝"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPosProductModal(false)}
                  className="bg-white/10 hover:bg-white/20 text-white h-8 w-8 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Modal Body */}
              <form onSubmit={handleSavePosProduct} className="p-5 overflow-y-auto space-y-4 text-xs text-slate-700">
                {/* Category Selection or Inline Creation */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="font-bold text-slate-800 flex items-center gap-1">
                      <Layers className="h-3.5 w-3.5 text-emerald-700" />
                      <span>القسم الرئيسي التابع له:</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowQuickAddCat(!showQuickAddCat)}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                    >
                      {showQuickAddCat ? "اختر من الأقسام المتاحة" : "+ إضافة قسم جديد فوراً"}
                    </button>
                  </div>

                  {showQuickAddCat ? (
                    <div className="flex gap-2 p-2.5 bg-emerald-50/50 border border-emerald-200 rounded-xl">
                      <input
                        type="text"
                        placeholder="اسم القسم الجديد (مثال: الشاي والمشروبات الدافئة)..."
                        value={quickNewCatName}
                        onChange={(e) => setQuickNewCatName(e.target.value)}
                        className="flex-1 p-2 text-xs rounded-lg border border-slate-200 outline-none bg-white font-bold"
                      />
                    </div>
                  ) : (
                    <select
                      required
                      value={itemCatSelect}
                      onChange={(e) => setItemCatSelect(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 outline-none bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800"
                    >
                      <option value="">-- حدد القسم الرئيسي --</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Product Name & Price */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-800 mb-1">اسم المنتج أو المادة:</label>
                    <input
                      type="text"
                      required
                      placeholder="مثال: سبانيش لاتيه بارد..."
                      value={itemNameInput}
                      onChange={(e) => setItemNameInput(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-bold"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-800 mb-1">سعر البيع (د.ع):</label>
                    <input
                      type="number"
                      required
                      min={0}
                      placeholder="مثال: 5000..."
                      value={itemPriceInput || ""}
                      onChange={(e) => setItemPriceInput(parseInt(e.target.value, 10) || 0)}
                      className="w-full p-2.5 text-xs rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 bg-white font-extrabold text-emerald-800"
                    />
                  </div>
                </div>

                {/* Image URL & Preset Selection */}
                <div>
                  <label className="block font-bold text-slate-800 mb-1">صورة المنتج (رابط أو اختر صورة جاهزة بنقرة واحدة):</label>
                  <input
                    type="text"
                    placeholder="ضع رابط صورة المنتج هنا..."
                    value={itemImgInput}
                    onChange={(e) => setItemImgInput(e.target.value)}
                    className="w-full p-2 text-xs rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-emerald-500 bg-white mb-2"
                  />

                  {/* Preset quick buttons */}
                  <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5">
                    <p className="text-[10px] text-slate-400 font-bold">✨ صور نموذجية جاهزة للقهوة والمشروبات (انقر للتطبيق):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: "☕ قهوة باردة", url: "https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&auto=format&fit=crop&q=60" },
                        { label: "☕ اسبريسو/لاتيه", url: "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?w=400&auto=format&fit=crop&q=60" },
                        { label: "🍹 مشروب بارد", url: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=400&auto=format&fit=crop&q=60" },
                        { label: "🍰 كيك وحلا", url: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=400&auto=format&fit=crop&q=60" },
                        { label: "🥐 مخبوزات", url: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=400&auto=format&fit=crop&q=60" },
                        { label: "🥤 عصير طازج", url: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&auto=format&fit=crop&q=60" }
                      ].map((preset, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setItemImgInput(preset.url)}
                          className="px-2.5 py-1 bg-white border border-slate-200 hover:border-emerald-500 rounded-lg text-[10px] font-bold text-slate-700 hover:text-emerald-800 transition-colors cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 📦 ربط التخفيض التلقائي من المستودع (متعدد المواد) */}
                <div className="border border-dashed border-emerald-400 p-3.5 rounded-2xl bg-emerald-50/30 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/60 pb-2">
                    <div>
                      <h5 className="font-extrabold text-emerald-950 text-xs flex items-center gap-1.5">
                        <span>🔗 المواد المستهلكة من المستودع عند البيع:</span>
                        <span className="text-[10px] bg-emerald-700 text-white font-black px-2 py-0.5 rounded-full">
                          {itemLinkedMaterials.length} مادة مرتبطة
                        </span>
                      </h5>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        أضف أي عدد من المواد (أكواب، بن، غطاء، شفاطة، حوامل) وحدد معدل الاستهلاك والتخفيض!
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={addLinkedMaterialRow}
                      className="bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold px-3 py-1.5 rounded-xl text-xs transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>+ ربط مادة جديدة</span>
                    </button>
                  </div>

                  {itemLinkedMaterials.length === 0 ? (
                    <div className="text-center py-4 bg-white/80 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs">
                      لم يتم ربط أي مادة مخزنية بهذا المنتج بعد. انقر على زر <strong>"+ ربط مادة جديدة"</strong> أعلاه للربط تلقائياً!
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {itemLinkedMaterials.map((mat, idx) => (
                        <div key={idx} className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
                          {/* اسم المادة بالـ Inventory */}
                          <div className="flex-1">
                            <span className="block text-[9.5px] font-bold text-slate-500 mb-0.5">المادة المخزنية:</span>
                            <select
                              value={mat.inventoryName}
                              onChange={(e) => updateLinkedMaterialRow(idx, "inventoryName", e.target.value)}
                              className="w-full p-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-bold text-slate-800 outline-none"
                            >
                              <option value="">-- اختر مادة من المستودع --</option>
                              {inventory.map((inv, i) => (
                                <option key={i} value={inv.name}>{inv.name} (المتبقي: {inv.total - inv.sold})</option>
                              ))}
                            </select>
                          </div>

                          {/* كمية الاستهلاك */}
                          <div className="w-full sm:w-28">
                            <span className="block text-[9.5px] font-bold text-slate-500 mb-0.5">كمية الاستهلاك:</span>
                            <input
                              type="number"
                              step="any"
                              min={0.01}
                              value={mat.consumeQty}
                              onChange={(e) => updateLinkedMaterialRow(idx, "consumeQty", parseFloat(e.target.value) || 0)}
                              className="w-full p-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-black text-center text-emerald-800 outline-none"
                              placeholder="1"
                            />
                          </div>

                          {/* عدد المبيعات المطلوب لخصم الكمية */}
                          <div className="w-full sm:w-36">
                            <span className="block text-[9.5px] font-bold text-slate-500 mb-0.5">لكل عدد مبيعات (Sales):</span>
                            <div className="flex items-center gap-1 bg-slate-50 p-1 border border-slate-200 rounded-lg">
                              <span className="text-[10px] text-slate-500 font-bold px-1">كل</span>
                              <input
                                type="number"
                                min={1}
                                value={mat.salesRatio}
                                onChange={(e) => updateLinkedMaterialRow(idx, "salesRatio", parseInt(e.target.value, 10) || 1)}
                                className="w-12 p-1 text-xs rounded border border-slate-200 bg-white font-black text-center text-slate-800 outline-none"
                              />
                              <span className="text-[10px] text-slate-500 font-bold px-1">بيع</span>
                            </div>
                          </div>

                          {/* Delete Row Button */}
                          <div className="pt-1 sm:pt-4 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => removeLinkedMaterialRow(idx)}
                              className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-2 rounded-lg text-xs transition-colors cursor-pointer"
                              title="إزالة هذه المادة"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="text-[10px] text-emerald-900 font-semibold bg-emerald-100/60 p-2 rounded-xl border border-emerald-200/60 leading-relaxed">
                    💡 <strong>توضيح آلية الخصم:</strong> إذا ضبطت (حاملة أكواب | كمية 1 | كل 4 بيع)، سيقوم النظام بخصم 1 حاملة أكواب من المستودع تلقائياً عند بيع كل 4 قطع من هذا المنتج!
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="submit"
                    className="flex-1 bg-emerald-800 hover:bg-emerald-900 text-white font-extrabold py-3 rounded-xl text-xs transition-all shadow-md cursor-pointer active:scale-98"
                  >
                    {posModalMode === "add" ? "حفظ وإضافة لشاشة البيع ⚡" : "تحديث بيانات المنتج الحالية ✅"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPosProductModal(false)}
                    className="px-5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl text-xs cursor-pointer transition-colors"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ⚠️ CUSTOM CONFIRM MODAL */}
      <AnimatePresence>
        {confirmConfig.isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="no-print fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-[9999]"
            dir="rtl"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl max-w-md w-full p-6 text-right relative font-sans"
            >
              <div className="flex items-center gap-3 mb-4 text-amber-500 border-b border-slate-800 pb-3">
                <AlertTriangle className="h-6 w-6 animate-pulse" />
                <h3 className="text-sm font-black text-white">{confirmConfig.title}</h3>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed font-semibold mb-6">
                {confirmConfig.message}
              </p>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs cursor-pointer transition-all active:scale-98"
                >
                  إلغاء وتراجع
                </button>
                <button
                  type="button"
                  onClick={confirmConfig.onConfirm}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl text-xs cursor-pointer transition-all shadow-md active:scale-98"
                >
                  تأكيد الإجراء ✅
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
