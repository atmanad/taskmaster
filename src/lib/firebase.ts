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
// IMPORTANT: Check if your environment variables are correctly set in your Vercel project settings.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Basic check if configuration seems loaded
if (!firebaseConfig.projectId) {
  console.error(
    'Firebase project ID is missing. Ensure NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variable is set correctly in your deployment environment (e.g., Vercel).'
  );
  // Optionally, you could throw an error here to prevent the app from proceeding without config,
  // but logging might be sufficient for debugging.
  // throw new Error("Firebase configuration is incomplete. Project ID is missing.");
}

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

  // Log inputs for debugging purposes, especially in production environments
  console.log(`Fetching todos - Type: ${type}, Date: ${date}`);
  // Check if Firebase config seems available at the time of fetching
  if (!firebaseConfig.projectId) {
      console.error("Attempted to fetch todos, but Firebase Project ID is missing. Check environment variables.");
      throw new Error("Firebase configuration is missing. Cannot fetch tasks.");
  }


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
      console.log(`Successfully fetched ${todos.length} ${type} todos.`); // Log success
      // No need for client-side sort anymore
      return todos;
  } catch (error: any) { // Catch error as 'any' to access properties like 'code'
      console.error(`Error getting ${type} documents (Date: ${date}): `, error);
      // Check for specific Firebase errors if needed
      let errorMessage = `Failed to fetch ${type} tasks.`;
      if (error.code) {
        console.error("Firestore error code:", error.code);
        // Provide more specific messages based on common Vercel/Firestore issues
        if (error.code === 'permission-denied') {
            errorMessage = `Permission denied when fetching ${type} tasks. Check your Firestore security rules.`;
        } else if (error.code === 'unauthenticated') {
             errorMessage = `Authentication error when fetching ${type} tasks. Ensure user is logged in or rules allow unauthenticated access.`;
        } else if (error.code === 'unavailable') {
            errorMessage = `Firestore service is unavailable. This might be a temporary issue or network problem.`;
        } else {
            errorMessage = `Failed to fetch ${type} tasks due to Firestore error (${error.code}). Check console and Firestore rules.`;
        }
      } else {
           errorMessage = `Failed to fetch ${type} tasks. Unknown error occurred. Please check console and Firestore rules/configuration.`;
      }
      throw new Error(errorMessage); // Throw a more informative error
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
     console.log(`Todo added with ID: ${docRef.id}`);
     return { ...dataToSave, id: docRef.id };
   } catch (error: any) {
     console.error("Error adding document: ", error);
     let errorMessage = "Failed to add task.";
      if (error.code) {
         errorMessage = `Failed to add task due to Firestore error (${error.code}). Check console and Firestore rules.`;
         if (error.code === 'permission-denied') {
             errorMessage = `Permission denied when adding task. Check Firestore rules.`;
         }
      } else {
          errorMessage = "Failed to add task. Unknown error. Check console and Firestore rules.";
      }
     throw new Error(errorMessage);
   }
};

// Update Todo function
export const updateTodo = async (id: string, updates: Partial<Pick<Todo, 'completed' | 'text'>>): Promise<void> => {
  // Get a non-converted doc reference for the update payload flexibility
  const todoDoc = doc(todosCollectionRef, id);
   try {
    await updateDoc(todoDoc, updates);
    console.log(`Todo updated: ${id}`);
   } catch (error: any) {
     console.error(`Error updating document ${id}: `, error);
     let errorMessage = "Failed to update task.";
      if (error.code) {
          errorMessage = `Failed to update task due to Firestore error (${error.code}). Check console and Firestore rules.`;
          if (error.code === 'permission-denied') {
             errorMessage = `Permission denied when updating task ${id}. Check Firestore rules.`;
          }
      } else {
          errorMessage = `Failed to update task ${id}. Unknown error. Check console and Firestore rules.`;
      }
     throw new Error(errorMessage);
   }
};

// Delete Todo function
export const deleteTodo = async (id: string): Promise<void> => {
  const todoDoc = doc(todosCollectionRef, id);
   try {
     await deleteDoc(todoDoc);
     console.log(`Todo deleted: ${id}`);
   } catch (error: any) {
     console.error(`Error deleting document ${id}: `, error);
     let errorMessage = "Failed to delete task.";
      if (error.code) {
          errorMessage = `Failed to delete task due to Firestore error (${error.code}). Check console and Firestore rules.`;
          if (error.code === 'permission-denied') {
             errorMessage = `Permission denied when deleting task ${id}. Check Firestore rules.`;
          }
      } else {
          errorMessage = `Failed to delete task ${id}. Unknown error. Check console and Firestore rules.`;
      }
     throw new Error(errorMessage);
   }
};
