import { useState, useEffect } from "react";
import { initializeApp, getApps } from "firebase/app";
import { getFirestore, collection, onSnapshot, addDoc, updateDoc, doc, serverTimestamp, query, orderBy, setDoc } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

const USERS = [
  { id: "director", name: "ホーム長", role: "管理職", color: "#1e3a5f" },
  { id: "vice_director", name: "副ホーム長", role: "管理職", color: "#1e3a5f" },
  { id: "representative", name: "代表", role: "管理職", color: "#1e3a5f" },
  { id: "ops_manager", name: "運営マネ", role: "管理職", color: "#1e3a5f" },
  { id: "care_manager", name: "ケアマネ", role: "専門職", color: "#2d6a4f" },
  { id: "nurse_a", name: "看護師A", role: "看護師", color: "#6b4c9a" },
  { id: "nurse_b", name: "看護師B", role: "看護師", color: "#6b4c9a" },
  { id: "nurse_c", name: "看護師C", role: "看護師", color: "#6b4c9a" },
  { id: "leader_1f", name: "1階リーダー", role: "フロアリーダー", color: "#b5451b" },
  { id: "leader_2f", name: "2階リーダー", role: "フロアリーダー", color: "#b5451b" },
];

const RESIDENTS = ["酒○","阿○","高○","江○","越○","1階小○","眞○○","細○","木○","橋○","野○","横○","松○","2階小○","的○","岡○","惣○","辻○"];

const CATEGORIES = [
  { id: "health", label: "健康・医療", icon: "🏥" },
  { id: "behavior", label: "行動・様子", icon: "👤" },
  { id: "family", label: "家族・面会", icon: "👨‍👩‍👧" },
  { id: "facility", label: "設備・環境", icon: "🏠" },
  { id: "staff", label: "スタッフ", icon: "👥" },
  { id: "other", label: "その他", icon: "📋" },
];

const formatTime = (ts) => {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "今";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`;
  return `${d.getMonth()+1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2,"0")}`;
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [posts, setPosts] = useState([]);
  const [filter, setFilter] = useState("active");
  const [view, setView] = useState("feed");
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [newPost, setNewPost] = useState({ urgency: "non_urgent", type: "notice", category: "other", resident: "", content: "" });
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setPosts(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    posts.forEach(p => {
      if (p.type === "notice" && !p.archived && p.readBy && p.readBy.length >= USERS.length) {
        updateDoc(doc(db, "posts", p.id), { archived: true });
      }
    });
  }, [posts]);

  useEffect(() => {
    if (!currentUser) return;
    const setupNotifications = async () => {
      try {
        if (!("Notification" in window)) return;
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
        const messaging = getMessaging(app);
        const token = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        });
        if (token) {
          await setDoc(doc(db, "fcm_tokens", token), {
            token,
            userId: currentUser.id,
            updatedAt: serverTimestamp(),
          });
          setNotifEnabled(true);
        }
        onMessage(messaging, (payload) => {
          notify(`🔔 ${payload.notification?.title || "新しい通知"}`, "urgent");
        });
      } catch (e) {
        console.log("通知設定エラー:", e);
      }
    };
    setupNotifications();
  }, [currentUser]);

  const notify = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const selectedPost = posts.find(p => p.id === selectedPostId);
  const activePosts = posts.filter(p => !p.archived && !p.resolved);
  const archivedPosts = posts.filter(p => p.archived || p.resolved);
  const urgentPosts = activePosts.filter(p => p.urgency === "urgent");

  const getFilteredPosts = () => {
    if (filter === "active") return activePosts;
    if (filter === "urgent") return activePosts.filter(p => p.urgency === "urgent");
    if (filter === "consultation") return activePosts.filter(p => p.type === "consultation");
    if (filter === "notice") return activePosts.filter(p => p.type === "notice");
    if (filter === "archived") return archivedPosts;
    return activePosts;
  };

  const sortedPosts = [...getFilteredPosts()].sort((a, b) => {
    if (a.urgency === "urgent" && b.urgency !== "urgent") return -1;
    if (b.urgency === "urgent" && a.urgency !== "urgent") return 1;
    const ta = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(a.timestamp || 0);
    con
