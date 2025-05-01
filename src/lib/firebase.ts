import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  Firestore,
  DocumentData,
  QueryDocumentSnapshot,
  FirestoreDataConverter
} from 'firebase/firestore';

// Your web app's Firebase configuration
// IMPORTANT: Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
let app: FirebaseApp;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

const db: Firestore = getFirestore(app);
const todosCollection = collection(db, 'todos');

// Define the Todo interface
export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: Date;
  date: string | null; // YYYY-MM-DD format for daily tasks, null for global
  type: 'daily' | 'global';
}

// Firestore data converter
const todoConverter: FirestoreDataConverter<Todo> = {
  toFirestore(todo: Omit<Todo, 'id'>): DocumentData {
    return {
      text: todo.text,
      completed: todo.completed,
      // Store dates as Firestore Timestamps for proper querying/sorting
      createdAt: Timestamp.fromDate(todo.createdAt),
      date: todo.date,
      type: todo.type,
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot<DocumentData>): Todo {
    const data = snapshot.data();
    // Convert Firestore Timestamp back to JavaScript Date
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date();
    return {
      id: snapshot.id,
      text: data.text,
      completed: data.completed,
      createdAt: createdAt,
      date: data.date,
      type: data.type,
    };
  }
};


// Get Todos function
export const getTodos = async (type: 'daily' | 'global', date?: string): Promise<Todo[]> => {
  let q;
  const todosRef = collection(db, 'todos').withConverter(todoConverter);

  if (type === 'daily') {
    if (!date) {
        console.warn("Date is required for fetching daily todos.");
        return []; // Or throw an error
    }
    // Query for tasks matching the specific type AND date
    q = query(todosRef, where('type', '==', 'daily'), where('date', '==', date));
  } else {
    // Query for tasks matching only the 'global' type
    q = query(todosRef, where('type', '==', 'global'));
  }

  try {
      const querySnapshot = await getDocs(q);
      const todos = querySnapshot.docs.map(doc => doc.data());
       // Sort by creation date if needed, Firestore might return them ordered by index
       todos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return todos;
  } catch (error) {
      console.error("Error getting documents: ", error);
      throw error; // Re-throw the error to be handled by the caller
  }
};


// Add Todo function
export const addTodo = async (todoData: Omit<Todo, 'id'>): Promise<Todo> => {
   try {
     const docRef = await addDoc(todosCollection.withConverter(todoConverter), todoData);
     // Construct the full Todo object including the new ID and return it
     return { ...todoData, id: docRef.id };
   } catch (error) {
     console.error("Error adding document: ", error);
     throw error;
   }
};

// Update Todo function
export const updateTodo = async (id: string, updates: Partial<Pick<Todo, 'completed' | 'text'>>): Promise<void> => {
  const todoDoc = doc(db, 'todos', id);
   try {
    await updateDoc(todoDoc, updates);
   } catch (error) {
     console.error("Error updating document: ", error);
     throw error;
   }
};

// Delete Todo function
export const deleteTodo = async (id: string): Promise<void> => {
  const todoDoc = doc(db, 'todos', id);
   try {
     await deleteDoc(todoDoc);
   } catch (error) {
     console.error("Error deleting document: ", error);
     throw error;
   }
};
