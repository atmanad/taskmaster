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
  FirestoreDataConverter,
  orderBy // Import orderBy
} from 'firebase/firestore';

// Your web app's Firebase configuration
// IMPORTANT: Check if your environment variables are correctly set
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
// Apply converter at the base collection level
const todosCollectionRef = collection(db, 'todos');

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
    // Ensure createdAt is always a Date before converting
    const createdAtDate = todo.createdAt instanceof Date ? todo.createdAt : new Date();
    return {
      text: todo.text,
      completed: todo.completed,
      // Store dates as Firestore Timestamps for proper querying/sorting
      createdAt: Timestamp.fromDate(createdAtDate),
      date: todo.date,
      type: todo.type,
    };
  },
  fromFirestore(snapshot: QueryDocumentSnapshot<DocumentData>): Todo {
    const data = snapshot.data({ serverTimestamps: 'estimate' }); // Use estimate for smoother client-side updates
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

// Get a reference to the collection with the converter applied
const todosCollection = todosCollectionRef.withConverter(todoConverter);


// Get Todos function
export const getTodos = async (type: 'daily' | 'global', date?: string): Promise<Todo[]> => {
  let q;

  try {
      if (type === 'daily') {
        if (!date) {
            console.warn("Date is required for fetching daily todos.");
            return []; // Return empty if no date provided for daily tasks
        }
        // Query for tasks matching the specific type AND date, ordered by creation time
        q = query(
            todosCollection, // Use the converter-applied collection
            where('type', '==', 'daily'),
            where('date', '==', date),
            orderBy('createdAt', 'asc') // Order by creation time ascending
        );
      } else {
        // Query for tasks matching only the 'global' type, ordered by creation time
        q = query(
            todosCollection, // Use the converter-applied collection
            where('type', '==', 'global'),
            orderBy('createdAt', 'asc') // Order by creation time ascending
        );
      }

      const querySnapshot = await getDocs(q);
      // Firestore automatically uses the converter here
      const todos = querySnapshot.docs.map(doc => doc.data());
      // No need for client-side sort anymore
      return todos;
  } catch (error) {
      console.error("Error getting documents: ", error);
      // Check for specific Firebase errors if needed
      if (error instanceof Error && 'code' in error) {
        // Handle specific Firestore error codes, e.g., 'permission-denied'
        console.error("Firestore error code:", (error as any).code);
      }
      throw new Error(`Failed to fetch ${type} tasks. Please check console and Firestore rules.`); // Throw a more informative error
  }
};


// Add Todo function
export const addTodo = async (todoData: Omit<Todo, 'id'>): Promise<Todo> => {
   try {
     // Ensure createdAt is a valid Date object
     const dataToSave = {
       ...todoData,
       createdAt: todoData.createdAt instanceof Date ? todoData.createdAt : new Date(),
     };
     // Use the collection reference with the converter
     const docRef = await addDoc(todosCollection, dataToSave);
     // Construct the full Todo object including the new ID and return it
     // Use the data that was actually saved
     return { ...dataToSave, id: docRef.id };
   } catch (error) {
     console.error("Error adding document: ", error);
     throw new Error("Failed to add task. Please check console and Firestore rules.");
   }
};

// Update Todo function
export const updateTodo = async (id: string, updates: Partial<Pick<Todo, 'completed' | 'text'>>): Promise<void> => {
  // Get a non-converted doc reference for the update payload flexibility
  const todoDoc = doc(todosCollectionRef, id);
   try {
    await updateDoc(todoDoc, updates);
   } catch (error) {
     console.error("Error updating document: ", error);
     throw new Error("Failed to update task. Please check console and Firestore rules.");
   }
};

// Delete Todo function
export const deleteTodo = async (id: string): Promise<void> => {
  const todoDoc = doc(todosCollectionRef, id);
   try {
     await deleteDoc(todoDoc);
   } catch (error) {
     console.error("Error deleting document: ", error);
      throw new Error("Failed to delete task. Please check console and Firestore rules.");
   }
};
