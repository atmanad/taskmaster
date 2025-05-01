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
  WithFieldValue,
  orderBy // Import orderBy
} from 'firebase/firestore';

// Your web app's Firebase configuration
// IMPORTANT: Ensure these environment variables are correctly set in your Vercel project settings.
// They MUST be prefixed with NEXT_PUBLIC_ to be available on the client-side.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// --- Enhanced Firebase Configuration Logging ---
console.log("Attempting to load Firebase config...");
let configComplete = true;
Object.entries(firebaseConfig).forEach(([key, value]) => {
    if (!value) {
        console.error(`Firebase config missing: NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`);
        configComplete = false;
    }
});

if (!configComplete) {
    console.error("Firebase configuration is incomplete. Please check your environment variables in Vercel (Project Settings > Environment Variables). Ensure they are prefixed with NEXT_PUBLIC_.");
    // Optional: You might want to throw an error in development, but logging is safer for production builds
    // throw new Error("Firebase configuration is incomplete.");
} else {
    console.log("Firebase config loaded. Project ID:", firebaseConfig.projectId); // Log Project ID on successful load
}
// --- End Enhanced Logging ---


// Initialize Firebase
let app: FirebaseApp;
let db: Firestore;

try {
    if (!getApps().length) {
      console.log("Initializing Firebase app...");
      app = initializeApp(firebaseConfig);
      console.log("Firebase app initialized successfully.");
    } else {
      app = getApps()[0];
      console.log("Using existing Firebase app instance.");
    }
    db = getFirestore(app);
    console.log("Firestore instance obtained.");
} catch (error) {
    console.error("Error initializing Firebase or Firestore:", error);
    // Handle initialization error appropriately
    // Maybe set db to null or throw a more specific error
    throw new Error("Failed to initialize Firebase. Check configuration and network.");
}


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
  toFirestore(todo: WithFieldValue<Todo>): DocumentData {
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
  console.log(`Attempting to fetch todos - Type: ${type}, Date: ${date}`);

  // Check if Firebase config seems available at the time of fetching (redundant but safe)
  if (!firebaseConfig.projectId || !db) {
      console.error("Attempted to fetch todos, but Firebase/Firestore is not configured or initialized correctly. Check config and initialization logs.");
      // Don't throw here if initialization might happen later, but return empty or handle as needed
      return [];
      // throw new Error("Firebase configuration/initialization is incomplete. Cannot fetch tasks.");
  }


  try {
      let queryDescription = `Query: type == ${type}`; // Description for logging

      if (type === 'daily') {
        if (!date) {
            console.warn("Date is required for fetching daily todos, but not provided. Returning empty array.");
            return []; // Return empty if no date provided for daily tasks
        }
        // Query for tasks matching the specific type AND date, ordered by creation time
        queryDescription += `, date == ${date}`;
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

      console.log(`Executing Firestore query: ${queryDescription}, orderBy createdAt asc`);
      const querySnapshot = await getDocs(q);
      console.log(`Firestore query executed. Found ${querySnapshot.docs.length} documents.`);

      // Firestore automatically uses the converter here
      const todos = querySnapshot.docs.map(doc => doc.data());

      // Optional: Log the first few fetched todos (without sensitive data)
      if (todos.length > 0) {
          console.log(`First fetched todo (id: ${todos[0].id}):`, { text: todos[0].text, completed: todos[0].completed, date: todos[0].date });
      }

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
            errorMessage = `Permission denied when fetching ${type} tasks (Date: ${date}). Check your Firestore security rules. Ensure rules allow reads for the deployed app/user state.`;
        } else if (error.code === 'unauthenticated') {
             errorMessage = `Authentication error when fetching ${type} tasks. Ensure user is logged in or rules allow unauthenticated access.`;
        } else if (error.code === 'unavailable') {
            errorMessage = `Firestore service is unavailable. This might be a temporary issue or network problem. Check Firebase status and Vercel network settings.`;
        } else if (error.code === 'internal') {
             errorMessage = `Firestore internal error (${error.code}). This might be transient. Check Firebase status.`;
        } else {
            errorMessage = `Failed to fetch ${type} tasks due to Firestore error (${error.code}). Check console, Firestore rules, and indexes.`;
        }
      } else {
           errorMessage = `Failed to fetch ${type} tasks (Date: ${date}). Unknown error occurred: ${error.message}. Please check console and Firestore rules/configuration.`;
      }
      // Throwing here will propagate the error to the calling component (TaskList)
      // Consider if you want to return [] instead to show an empty list with an error message
      throw new Error(errorMessage);
  }
};


// Add Todo function
export const addTodo = async (todoData: Omit<Todo, 'id'>): Promise<Todo> => {
   if (!db) {
        console.error("Firestore is not initialized. Cannot add task.");
        throw new Error("Firestore is not initialized.");
   }
   try {
     // Ensure createdAt is a valid Date object
     const dataToSave = {
       ...todoData,
       createdAt:  new Date(),
     };
     console.log(`Attempting to add todo:`, { text: dataToSave.text, type: dataToSave.type, date: dataToSave.date });
     // Use the collection reference with the converter
     const docRef = await addDoc(todosCollection, dataToSave);
     // Construct the full Todo object including the new ID and return it
     // Use the data that was actually saved
     console.log(`Todo added successfully with ID: ${docRef.id}`);
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
          errorMessage = `Failed to add task. Unknown error: ${error.message}. Check console and Firestore rules.`;
      }
     throw new Error(errorMessage);
   }
};

// Update Todo function
export const updateTodo = async (id: string, updates: Partial<Pick<Todo, 'completed' | 'text'>>): Promise<void> => {
  if (!db) {
    console.error("Firestore is not initialized. Cannot update task.");
    throw new Error("Firestore is not initialized.");
  }
  // Get a non-converted doc reference for the update payload flexibility
  const todoDoc = doc(todosCollectionRef, id);
   try {
    console.log(`Attempting to update todo ${id} with:`, updates);
    await updateDoc(todoDoc, updates);
    console.log(`Todo updated successfully: ${id}`);
   } catch (error: any) {
     console.error(`Error updating document ${id}: `, error);
     let errorMessage = "Failed to update task.";
      if (error.code) {
          errorMessage = `Failed to update task due to Firestore error (${error.code}). Check console and Firestore rules.`;
          if (error.code === 'permission-denied') {
             errorMessage = `Permission denied when updating task ${id}. Check Firestore rules.`;
          }
      } else {
          errorMessage = `Failed to update task ${id}. Unknown error: ${error.message}. Check console and Firestore rules.`;
      }
     throw new Error(errorMessage);
   }
};

// Delete Todo function
export const deleteTodo = async (id: string): Promise<void> => {
  if (!db) {
    console.error("Firestore is not initialized. Cannot delete task.");
    throw new Error("Firestore is not initialized.");
  }
  const todoDoc = doc(todosCollectionRef, id);
   try {
     console.log(`Attempting to delete todo: ${id}`);
     await deleteDoc(todoDoc);
     console.log(`Todo deleted successfully: ${id}`);
   } catch (error: any) {
     console.error(`Error deleting document ${id}: `, error);
     let errorMessage = "Failed to delete task.";
      if (error.code) {
          errorMessage = `Failed to delete task due to Firestore error (${error.code}). Check console and Firestore rules.`;
          if (error.code === 'permission-denied') {
             errorMessage = `Permission denied when deleting task ${id}. Check Firestore rules.`;
          }
      } else {
          errorMessage = `Failed to delete task ${id}. Unknown error: ${error.message}. Check console and Firestore rules.`;
      }
     throw new Error(errorMessage);
   }
};
