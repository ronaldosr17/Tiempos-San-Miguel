import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, doc, getDoc, setDoc, addDoc,
  updateDoc, deleteDoc, collection, onSnapshot, query, where, runTransaction,
  getDocsFromServer, getCountFromServer, limit, orderBy, documentId, startAfter
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDl0NPag3aKGAnwZDRW--IpWQewwhyb3HY",
  authDomain: "tiempos-san-miguel.firebaseapp.com",
  projectId: "tiempos-san-miguel",
  storageBucket: "tiempos-san-miguel.firebasestorage.app",
  messagingSenderId: "774681656050",
  appId: "1:774681656050:web:a199acf3b9c76337aeae6b"
};

const fbApp = initializeApp(firebaseConfig);
const fbAuth = getAuth(fbApp);
const fbDb = initializeFirestore(fbApp, { localCache: persistentLocalCache() });

window.firebaseAuth = {
  signIn: (email, pass) => signInWithEmailAndPassword(fbAuth, email, pass),
  signOut: () => signOut(fbAuth),
  onChange: (cb) => onAuthStateChanged(fbAuth, cb),
  getUserDoc: (uid) => getDoc(doc(fbDb, 'usuarios', uid))
};

// Crea un usuario con una app secundaria para no cerrar la sesión del admin
window.createNewUserAccount = async (email, pass, name, role, puntoVentaId) => {
  if(!['admin','vendedor'].includes(role) || (role==='vendedor' && !puntoVentaId)) throw new Error('Seleccioná un rol y un punto de venta.');
  const secondaryApp = initializeApp(firebaseConfig, "SecondaryAppForCreation");
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    const uid = userCred.user.uid;
    await setDoc(doc(fbDb, 'usuarios', uid), { name, role, email, ...(role==='vendedor' ? {puntoVentaId} : {}) });
    await signOut(secondaryAuth);
    await deleteApp(secondaryApp);
    return true;
  } catch (err) {
    try { await deleteApp(secondaryApp); } catch (e) {}
    throw err;
  }
};

window.fs = {
  db: fbDb, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, collection,
  onSnapshot, query, where, runTransaction, getDocsFromServer, getCountFromServer,
  limit, orderBy, documentId, startAfter
};

window.dispatchEvent(new Event('firebase-ready'));