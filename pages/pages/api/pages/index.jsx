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
    const tb = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(b.timestamp || 0);
    return tb - ta;
  });

  const submitPost = async () => {
    if (!newPost.content.trim()) return;
    try {
      await addDoc(collection(db, "posts"), {
        authorId: currentUser.id,
        urgency: newPost.urgency,
        type: newPost.type,
        category: newPost.category,
        resident: newPost.resident,
        content: newPost.content,
        timestamp: serverTimestamp(),
        replies: [],
        readBy: [currentUser.id],
        archived: false,
        resolved: false,
      });
      await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newPost.urgency === "urgent" ? "🚨 緊急連絡" : "📢 新しい投稿",
          body: newPost.content.slice(0, 50),
          authorId: currentUser.id,
        }),
      });
      setShowCreate(false);
      setNewPost({ urgency: "non_urgent", type: "notice", category: "other", resident: "", content: "" });
      notify(newPost.urgency === "urgent" ? "🚨 緊急投稿を送信しました" : "✅ 投稿を送信しました", newPost.urgency === "urgent" ? "urgent" : "success");
    } catch (e) {
      notify("送信に失敗しました", "error");
    }
  };

  const markRead = async (postId) => {
    const post = posts.find(p => p.id === postId);
    if (!post || (post.readBy || []).includes(currentUser.id)) return;
    await updateDoc(doc(db, "posts", postId), {
      readBy: [...(post.readBy || []), currentUser.id]
    });
  };

  const resolvePost = async (postId) => {
    await updateDoc(doc(db, "posts", postId), {
      resolved: true,
      resolvedBy: currentUser.id,
      resolvedAt: serverTimestamp(),
    });
    notify("✅ 相談済みにしてアーカイブしました");
  };

  const openPost = (post) => { setSelectedPostId(post.id); markRead(post.id); setView("detail"); };

  const submitReply = async () => {
    if (!replyText.trim() || !selectedPost) return;
    const reply = { authorId: currentUser.id, content: replyText, timestamp: new Date().toISOString() };
    await updateDoc(doc(db, "posts", selectedPost.id), {
      replies: [...(selectedPost.replies || []), reply]
    });
    setReplyText("");
    notify("返信を送信しました");
    await fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "💬 返信が届きました",
        body: replyText.slice(0, 50),
        authorId: currentUser.id,
      }),
    });
  };

  const getUserById = (id) => USERS.find(u => u.id === id) || { name: id, color: "#888" };
  const isUnread = (post) => !(post.readBy || []).includes(currentUser?.id || "");

  const S = {
    wrap: { fontFamily: "'Hiragino Kaku Gothic Pro','Meiryo',sans-serif", minHeight: "100vh", background: "#f0f4f8" },
    loginBg: { minHeight: "100vh", background: "linear-gradient(135deg,#e8f4f0,#d6eaf8)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
    loginCard: { background: "white", borderRadius: 20, padding: "32px 28px", maxWidth: 420, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.12)" },
    loginLogo: { display: "flex", alignItems: "center", gap: 14, marginBottom: 24 },
    loginTitle: { fontSize: 22, fontWeight: 700, color: "#1a3a4a" },
    loginSub: { fontSize: 12, color: "#7a9ab0", marginTop: 2 },
    loginPrompt: { fontSize: 14, color: "#5a7a8a", marginBottom: 20 },
    loginGroup: { marginBottom: 20 },
    loginGroupLabel: { fontSize: 11, fontWeight: 700, color: "#9ab0bc", letterSpacing: 2, marginBottom: 8 },
    loginGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
    loginBtn: { display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 100, border: "2px solid #e8f0f4", background: "white", cursor: "pointer" },
    header: { background: "white", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e0eaf0", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" },
    headerL: { display: "flex", alignItems: "center", gap: 8 },
    headerTitle: { fontSize: 16, fontWeight: 700, color: "#1a3a4a" },
    urgentBadge: { background: "#e74c3c", color: "white", fontSize: 11, fontWeight: 700, borderRadius: 100, padding: "2px 7px" },
    notifBadge: { background: "#2ecc71", color: "white", fontSize: 11, fontWeight: 700, borderRadius: 100, padding: "2px 8px" },
    notifOffBadge: { background: "#e0e0e0", color: "#888", fontSize: 11, fontWeight: 700, borderRadius: 100, padding: "2px 8px" },
    headerR: { display: "flex", alignItems: "center", gap: 8 },
    logoutBtn: { background: "#f0f4f8", border: "none", color: "#5a7a8a", fontSize: 12, cursor: "pointer", padding: "5px 10px", borderRadius: 8 },
    backBtn: { background: "none", border: "none", color: "#2a7a9a", fontSize: 15, cursor: "pointer", fontWeight: 600 },
    greeting: { padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, fontSize: 14, color: "#4a6a7a", flexWrap: "wrap" },
    greetingName: { fontWeight: 700, color: "#1a3a4a" },
    urgentAlert: { background: "#fdf0f0", color: "#e74c3c", fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 100, border: "1px solid #f9c9c9" },
    filterBar: { display: "flex", gap: 8, padding: "0 16px 14px", overflowX: "auto" },
    filterTab: (active, isArchive) => ({ padding: "7px 14px", borderRadius: 100, border: `2px solid ${active ? (isArchive ? "#9ab0bc" : "#1e3a5f") : "#dce8f0"}`, background: active ? (isArchive ? "#9ab0bc" : "#1e3a5f") : "white", color: active ? "white" : "#5a7a8a", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }),
    feed: { padding: "0 16px", display: "flex", flexDirection: "column", gap: 12, paddingBottom: 90 },
    empty: { textAlign: "center", color: "#9ab0bc", padding: 40, fontSize: 14 },
    loadingWrap: { textAlign: "center", color: "#9ab0bc", padding: 60, fontSize: 14 },
    postCard: (urgent, unread, isArc) => ({ background: isArc ? "#f8f8f8" : "white", borderRadius: 16, overflow: "hidden", boxShadow: urgent ? "0 4px 20px rgba(231,76,60,0.2)" : unread ? "0 4px 20px rgba(30,90,200,0.12)" : "0 2px 12px rgba(0,0,0,0.06)", cursor: "pointer", display: "flex", opacity: isArc ? 0.8 : 1 }),
    urgentStripe: { width: 5, background: "linear-gradient(180deg,#e74c3c,#c0392b)", flexShrink: 0 },
    resolvedStripe: { width: 5, background: "linear-gradient(180deg,#27ae60,#2ecc71)", flexShrink: 0 },
    archivedStripe: { width: 5, background: "#bbb", flexShrink: 0 },
    postInner: { padding: "14px 16px", flex: 1 },
    postTop: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    postBadges: { display: "flex", gap: 6, flexWrap: "wrap" },
    unreadDot: { width: 10, height: 10, borderRadius: "50%", background: "#3498db", flexShrink: 0 },
    postContent: { fontSize: 14, color: "#2a3a4a", lineHeight: 1.6, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" },
    postFooter: { display: "flex", justifyContent: "space-between", alignItems: "center" },
    postAuthorRow: { display: "flex", alignItems: "center", gap: 6 },
    postMeta: { display: "flex", alignItems: "center", gap: 8 },
    bUrgent: { fontSize: 11, fontWeight: 700, color: "#e74c3c", background: "#fdf0f0", padding: "2px 8px", borderRadius: 100, border: "1px solid #f9c9c9" },
    bNormal: { fontSize: 11, color: "#6a8a9a", background: "#f0f4f8", padding: "2px 8px", borderRadius: 100 },
    bConsult: { fontSize: 11, fontWeight: 700, color: "#2980b9", background: "#eaf4fb", padding: "2px 8px", borderRadius: 100 },
    bNotice: { fontSize: 11, color: "#27ae60", background: "#eafaf1", padding: "2px 8px", borderRadius: 100 },
    bResolved: { fontSize: 11, fontWeight: 700, color: "#27ae60", background: "#eafaf1", padding: "2px 8px", borderRadius: 100, border: "1px solid #a8e6c0" },
    bArchived: { fontSize: 11, color: "#888", background: "#eee", padding: "2px 8px", borderRadius: 100 },
    bCat: { fontSize: 13 },
    bResident: { fontSize: 11, color: "#9a7a6a", background: "#f5ede8", padding: "2px 7px", borderRadius: 100 },
    txt11gray: { fontSize: 11, color: "#9ab0bc" },
    txt11blue: { fontSize: 11, color: "#3498db", fontWeight: 600 },
    txt12bold: { fontSize: 12, color: "#6a8a9a", fontWeight: 600 },
    av: (color, size=28) => ({ width: size, height: size, borderRadius: "50%", background: color, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: size*0.45, fontWeight: 700 }),
    detailWrap: { padding: "16px 20px", paddingBottom: 80 },
    badgeRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 },
    bLg: (color, bg, border) => ({ fontSize: 13, fontWeight: 700, color, background: bg, padding: "4px 12px", borderRadius: 100, border: `1px solid ${border || bg}` }),
    detailMeta: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
    detailAuthor: { fontSize: 14, fontWeight: 700, color: "#2a3a4a" },
    detailTime: { fontSize: 12, color: "#9ab0bc", marginLeft: "auto" },
    detailContent: { fontSize: 15, color: "#2a3a4a", lineHeight: 1.8, background: "white", padding: 20, borderRadius: 14, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.05)" },
    readBox: { background: "white", borderRadius: 14, padding: 16, marginBottom: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.05)" },
    readLabel: { fontSize: 12, fontWeight: 700, color: "#9ab0bc", letterSpacing: 1 },
    readCount: { fontSize: 20, fontWeight: 700, color: "#1a3a4a", display: "block", margin: "4px 0" },
    readBarBg: { height: 6, background: "#e8f0f4", borderRadius: 10, marginBottom: 12 },
    readBarFill: (pct) => ({ height: "100%", background: "linear-gradient(90deg,#2ecc71,#27ae60)", borderRadius: 10, width: `${pct}%` }),
    readAvatars: { display: "flex", flexWrap: "wrap", gap: 6 },
    readAvatar: (color, read) => ({ width: 32, height: 32, borderRadius: "50%", background: read ? color : "#ddd", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: 12, fontWeight: 700, opacity: read ? 1 : 0.4 }),
    repliesBox: { background: "white", borderRadius: 14, padding: 16, boxShadow: "0 2px 10px rgba(0,0,0,0.05)" },
    repliesTitle: { fontSize: 14, fontWeight: 700, color: "#1a3a4a", marginBottom: 14 },
    emptyReply: { fontSize: 13, color: "#9ab0bc", textAlign: "center", padding: "20px 0" },
    replyCard: { background: "#f5f8fa", borderRadius: 10, padding: 12, marginBottom: 10 },
    replyMeta: { display: "flex", alignItems: "center", gap: 8, marginBottom: 6 },
    replyContent: { fontSize: 14, color: "#3a4a5a", lineHeight: 1.6 },
    replyInputRow: { display: "flex", gap: 10, marginTop: 12, alignItems: "flex-end" },
    replyInput: { flex: 1, padding: "10px 14px", borderRadius: 10, border: "2px solid #dce8f0", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none" },
    replyBtn: { padding: "10px 18px", background: "#1e3a5f", color: "white", border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer", fontSize: 14, flexShrink: 0 },
    resolveBtn: { width: "100%", padding: 14, background: "linear-gradient(135deg,#27ae60,#2ecc71)", color: "white", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 14 },
    resolvedBanner: { background: "#eafaf1", border: "1px solid #a8e6c0", borderRadius: 12, padding: "12px 16px", fontSize: 13, color: "#27ae60", fontWeight: 600, marginTop: 14, textAlign: "center" },
    fab: { position: "fixed", bottom: 28, right: 24, width: 58, height: 58, borderRadius: "50%", background: "linear-gradient(135deg,#1e3a5f,#2980b9)", color: "white", fontSize: 28, border: "none", boxShadow: "0 8px 25px rgba(30,58,95,0.4)", cursor: "pointer", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" },
    overlay: { position: "fixed", inset: 0, background: "rgba(10,20,30,0.6)", zIndex: 300, display: "flex", alignItems: "flex-end", backdropFilter: "blur(4px)" },
    modal: { background: "white", borderRadius: "20px 20px 0 0", padding: "24px 20px 32px", width: "100%", maxHeight: "90vh", overflowY: "auto" },
    modalHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
    modalTitle: { fontSize: 18, fontWeight: 700, color: "#1a3a4a" },
    modalClose: { background: "none", border: "none", fontSize: 20, color: "#9ab0bc", cursor: "pointer" },
    formSec: { marginBottom: 18 },
    formLabel: { fontSize: 12, fontWeight: 700, color: "#9ab0bc", letterSpacing: 1, marginBottom: 8, textTransform: "uppercase", display: "block" },
    toggleRow: { display: "flex", gap: 10 },
    toggleBtn: (active, as) => ({ flex: 1, padding: "12px 8px", borderRadius: 12, border: active ? `2px solid ${as.border}` : "2px solid #dce8f0", background: active ? as.bg : "white", color: active ? as.color : "#9ab0bc", fontSize: 14, fontWeight: 600, cursor: "pointer" }),
    catGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 },
    catBtn: (active) => ({ padding: "10px 4px", borderRadius: 10, border: `2px solid ${active ? "#2980b9" : "#e0eaf0"}`, background: active ? "#eaf4fb" : "white", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontSize: 14, color: active ? "#2980b9" : "#6a8a9a" }),
    select: { width: "100%", padding: "12px 14px", borderRadius: 10, border: "2px solid #dce8f0", fontSize: 14, background: "white", color: "#2a3a4a", outline: "none", fontFamily: "inherit" },
    textarea: { width: "100%", padding: "12px 14px", borderRadius: 10, border: "2px solid #dce8f0", fontSize: 14, fontFamily: "inherit", resize: "none", outline: "none", boxSizing: "border-box" },
    urgentWarn: { background: "#fdf0f0", border: "1px solid #f9c9c9", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "#e74c3c", fontWeight: 600, marginBottom: 14 },
    submitBtn: (urgent) => ({ width: "100%", padding: 16, background: urgent ? "linear-gradient(135deg,#c0392b,#e74c3c)" : "linear-gradient(135deg,#1e3a5f,#2980b9)", color: "white", border: "none", borderRadius: 14, fontSize: 16, fontWeight: 700, cursor: "pointer" }),
    toast: (urgent) => ({ position: "fixed", top: 70, left: "50%", transform: "translateX(-50%)", background: urgent ? "#e74c3c" : "#2ecc71", color: "white", padding: "12px 24px", borderRadius: 100, fontSize: 14, fontWeight: 700, zIndex: 400, boxShadow: "0 4px 20px rgba(0,0,0,0.2)", whiteSpace: "nowrap" }),
  };

  if (!currentUser) {
    const grouped = USERS.reduce((acc, u) => { (acc[u.role] = acc[u.role] || []).push(u); return acc; }, {});
    return (
      <div style={S.loginBg}>
        <div style={S.loginCard}>
          <div style={S.loginLogo}>
            <span style={{ fontSize: 38 }}>🏡</span>
            <div>
              <div style={S.loginTitle}>ホーム報連相</div>
              <div style={S.loginSub}>グループホーム情報共有アプリ</div>
            </div>
          </div>
          <p style={S.loginPrompt}>ユーザーを選択してログイン</p>
          {Object.entries(grouped).map(([role, users]) => (
            <div key={role} style={S.loginGroup}>
              <div style={S.loginGroupLabel}>{role}</div>
              <div style={S.loginGrid}>
                {users.map(u => (
                  <button key={u.id} style={S.loginBtn} onClick={() => setCurrentUser(u)}>
                    <span style={{ ...S.av(u.color), flexShrink: 0 }}>{u.name[0]}</span>
                    <span style={{ fontSize: 14, color: "#2a4a5a", fontWeight: 600 }}>{u.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "detail" && selectedPost) {
    const author = getUserById(selectedPost.authorId);
    const cat = CATEGORIES.find(c => c.id === selectedPost.category);
    const isArchived = selectedPost.archived || selectedPost.resolved;
    return (
      <div style={S.wrap}>
        {notification && <div style={S.toast(notification.type === "urgent")}>{notification.msg}</div>}
        <div style={S.header}>
          <button style={S.backBtn} onClick={() => { setView("feed"); setSelectedPostId(null); }}>← 戻る</button>
          <span style={{ fontSize: 15, fontWeight: 700, color: "#1a3a4a" }}>投稿詳細</span>
          <div style={{ width: 60 }} />
        </div>
        <div style={S.detailWrap}>
          <div style={S.badgeRow}>
            <span style={S.bLg(selectedPost.urgency === "urgent" ? "#e74c3c" : "#6a8a9a", selectedPost.urgency === "urgent" ? "#fdf0f0" : "#f0f4f8", selectedPost.urgency === "urgent" ? "#f9c9c9" : undefined)}>
              {selectedPost.urgency === "urgent" ? "🚨 緊急" : "📋 通常"}
            </span>
            <span style={S.bLg(selectedPost.type === "consultation" ? "#2980b9" : "#27ae60", selectedPost.type === "consultation" ? "#eaf4fb" : "#eafaf1")}>
              {selectedPost.type === "consultation" ? "💬 相談" : "📢 周知"}
            </span>
            {cat && <span style={S.bLg("#7a6a5a", "#f5f0ea")}>{cat.icon} {cat.label}</span>}
            {selectedPost.resident && <span style={S.bLg("#9a7a6a", "#f5ede8")}>👤 {selectedPost.resident}</span>}
            {selectedPost.resolved && <span style={S.bLg("#27ae60", "#eafaf1", "#a8e6c0")}>✅ 相談済み</span>}
            {selectedPost.archived && !selectedPost.resolved && <span style={S.bLg("#888", "#eee")}>📁 全員既読</span>}
          </div>
          <div style={S.detailMeta}>
            <span style={S.av(author.color)}>{author.name[0]}</span>
            <span style={S.detailAuthor}>{author.name}</span>
            <span style={S.detailTime}>{formatTime(selectedPost.timestamp)}</span>
          </div>
          <div style={S.detailContent}>{selectedPost.content}</div>
          <div style={S.readBox}>
            <span style={S.readLabel}>既読状況</span>
            <span style={S.readCount}>{(selectedPost.readBy || []).length} / {USERS.length} 名</span>
            <div style={S.readBarBg}><div style={S.readBarFill(((selectedPost.readBy || []).length / USERS.length) * 100)} /></div>
            <div style={S.readAvatars}>
              {USERS.map(u => (
                <span key={u.id} title={u.name} style={S.readAvatar(u.color, (selectedPost.readBy || []).includes(u.id))}>{u.name[0]}</span>
              ))}
            </div>
          </div>
          {selectedPost.type === "consultation" && (
            <div style={S.repliesBox}>
              <div style={S.repliesTitle}>💬 返信 ({(selectedPost.replies || []).length}件)</div>
              {(selectedPost.replies || []).length === 0 && <div style={S.emptyReply}>まだ返信がありません</div>}
              {(selectedPost.replies || []).map((r, i) => {
                const ru = getUserById(r.authorId);
                return (
                  <div key={i} style={S.replyCard}>
                    <div style={S.replyMeta}>
                      <span style={S.av(ru.color)}>{ru.name[0]}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#2a3a4a" }}>{ru.name}</span>
                      <span style={{ fontSize: 11, color: "#9ab0bc", marginLeft: "auto" }}>{formatTime(r.timestamp)}</span>
                    </div>
                    <div style={S.replyContent}>{r.content}</div>
                  </div>
                );
              })}
              {!isArchived && (
                <div style={S.replyInputRow}>
                  <textarea style={S.replyInput} placeholder="返信を入力..." value={replyText} onChange={e => setReplyText(e.target.value)} rows={3} />
                  <button style={S.replyBtn} onClick={submitReply} disabled={!replyText.trim()}>送信</button>
                </div>
              )}
              {selectedPost.resolved
                ? <div style={S.resolvedBanner}>✅ この相談は解決済みです</div>
                : !isArchived && <button style={S.resolveBtn} onClick={() => resolvePost(selectedPost.id)}>✅ 解決済みにしてアーカイブ</button>
              }
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      {notification && <div style={S.toast(notification.type === "urgent")}>{notification.msg}</div>}
      <div style={S.header}>
        <div style={S.headerL}>
          <span style={{ fontSize: 20 }}>🏡</span>
          <span style={S.headerTitle}>ホーム報連相</span>
          {urgentPosts.length > 0 && <span style={S.urgentBadge}>{urgentPosts.length}</span>}
        </div>
        <div style={S.headerR}>
          <span style={notifEnabled ? S.notifBadge : S.notifOffBadge}>
            {notifEnabled ? "🔔 通知ON" : "🔕 通知OFF"}
          </span>
          <span style={S.av(currentUser.color, 32)}>{currentUser.name[0]}</span>
          <button style={S.logoutBtn} onClick={() => setCurrentUser(null)}>変更</button>
        </div>
      </div>
      <div style={S.greeting}>
        <span style={S.greetingName}>{currentUser.name}</span>さん、お疲れ様です
        {urgentPosts.length > 0 && <span style={S.urgentAlert}>🚨 緊急案件 {urgentPosts.length}件</span>}
      </div>
      <div style={S.filterBar}>
        {[
          ["active", "📋 未対応"],
          ["urgent", "🚨 緊急"],
          ["consultation", "💬 相談中"],
          ["notice", "📢 周知"],
          ["archived", "📁 アーカイブ"],
        ].map(([k, l]) => (
          <button key={k} style={S.filterTab(filter === k, k === "archived")} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      <div style={S.feed}>
        {loading && <div style={S.loadingWrap}>読み込み中...</div>}
        {!loading && sortedPosts.length === 0 && (
          <div style={S.empty}>
            {filter === "archived" ? "アーカイブはまだありません" : "該当する投稿がありません"}
          </div>
        )}
        {sortedPosts.map(post => {
          const author = getUserById(post.authorId);
          const unread = isUnread(post);
          const cat = CATEGORIES.find(c => c.id === post.category);
          const isArc = post.archived || post.resolved;
          return (
            <div key={post.id} style={S.postCard(post.urgency === "urgent", unread, isArc)} onClick={() => openPost(post)}>
              {post.resolved ? <div style={S.resolvedStripe} />
                : isArc ? <div style={S.archivedStripe} />
                : post.urgency === "urgent" ? <div style={S.urgentStripe} />
                : null}
              <div style={S.postInner}>
                <div style={S.postTop}>
                  <div style={S.postBadges}>
                    <span style={post.urgency === "urgent" ? S.bUrgent : S.bNormal}>{post.urgency === "urgent" ? "🚨 緊急" : "通常"}</span>
                    <span style={post.type === "consultation" ? S.bConsult : S.bNotice}>{post.type === "consultation" ? "💬 相談" : "📢 周知"}</span>
                    {post.resolved && <span style={S.bResolved}>✅ 相談済み</span>}
                    {post.archived && !post.resolved && <span style={S.bArchived}>📁 全員既読</span>}
                    {cat && <span style={S.bCat}>{cat.icon}</span>}
                  </div>
                  {unread && !isArc && <span style={S.unreadDot} />}
                </div>
                <div style={S.postContent}>{post.content}</div>
                <div style={S.postFooter}>
                  <div style={S.postAuthorRow}>
                    <span style={S.av(author.color, 20)}>{author.name[0]}</span>
                    <span style={S.txt12bold}>{author.name}</span>
                    {post.resident && <span style={S.bResident}>👤 {post.resident}</span>}
                  </div>
                  <div style={S.postMeta}>
                    <span style={S.txt11gray}>{formatTime(post.timestamp)}</span>
                    {post.type === "consultation" && (post.replies || []).length > 0 && <span style={S.txt11blue}>💬 {post.replies.length}</span>}
                    <span style={S.txt11gray}>👁 {(post.readBy || []).length}/{USERS.length}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {filter !== "archived" && (
        <button style={S.fab} onClick={() => setShowCreate(true)}>＋</button>
      )}
      {showCreate && (
        <div style={S.overlay} onClick={() => setShowCreate(false)}>
          <div style={S.modal} onClick={e => e.stopPropagation()}>
            <div style={S.modalHeader}>
              <span style={S.modalTitle}>新規投稿</span>
              <button style={S.modalClose} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div style={S.formSec}>
              <span style={S.formLabel}>緊急度</span>
              <div style={S.toggleRow}>
                <button style={S.toggleBtn(newPost.urgency === "urgent", { bg: "#fdf0f0", color: "#e74c3c", border: "#e74c3c" })} onClick={() => setNewPost(p => ({ ...p, urgency: "urgent" }))}>🚨 緊急</button>
                <button style={S.toggleBtn(newPost.urgency === "non_urgent", { bg: "#f0f4f8", color: "#1e3a5f", border: "#1e3a5f" })} onClick={() => setNewPost(p => ({ ...p, urgency: "non_urgent" }))}>📋 通常</button>
              </div>
            </div>
            <div style={S.formSec}>
              <span style={S.formLabel}>投稿種別</span>
              <div style={S.toggleRow}>
                <button style={S.toggleBtn(newPost.type === "consultation", { bg: "#eaf4fb", color: "#2980b9", border: "#2980b9" })} onClick={() => setNewPost(p => ({ ...p, type: "consultation" }))}>💬 相談（返信あり）</button>
                <button style={S.toggleBtn(newPost.type === "notice", { bg: "#eafaf1", color: "#27ae60", border: "#27ae60" })} onClick={() => setNewPost(p => ({ ...p, type: "notice" }))}>📢 周知（既読のみ）</button>
              </div>
            </div>
            <div style={S.formSec}>
              <span style={S.formLabel}>カテゴリ</span>
              <div style={S.catGrid}>
                {CATEGORIES.map(c => (
                  <button key={c.id} style={S.catBtn(newPost.category === c.id)} onClick={() => setNewPost(p => ({ ...p, category: c.id }))}>
                    <span>{c.icon}</span><span style={{ fontSize: 11 }}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={S.formSec}>
              <span style={S.formLabel}>利用者（任意）</span>
              <select style={S.select} value={newPost.resident} onChange={e => setNewPost(p => ({ ...p, resident: e.target.value }))}>
                <option value="">選択なし</option>
                {RESIDENTS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={S.formSec}>
              <span style={S.formLabel}>内容 *</span>
              <textarea style={S.textarea} placeholder="内容を入力してください..." value={newPost.content} onChange={e => setNewPost(p => ({ ...p, content: e.target.value }))} rows={5} />
            </div>
            {newPost.urgency === "urgent" && <div style={S.urgentWarn}>🚨 全スタッフに緊急通知が送信されます</div>}
            <button style={S.submitBtn(newPost.urgency === "urgent")} onClick={submitPost} disabled={!newPost.content.trim()}>
              {newPost.urgency === "urgent" ? "🚨 緊急投稿する" : "投稿する"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
