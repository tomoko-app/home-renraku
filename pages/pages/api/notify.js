import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { title, body, authorId } = req.body;
  try {
    const snapshot = await db.collection("fcm_tokens").get();
    const tokens = snapshot.docs
      .map(d => d.data())
      .filter(d => d.userId !== authorId)
      .map(d => d.token);
    if (tokens.length === 0) return res.status(200).json({ sent: 0 });
    const result = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
    });
    res.status(200).json({ sent: result.successCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
