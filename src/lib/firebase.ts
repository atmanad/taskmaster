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
console.log("[Firebase] Attempting to load Firebase config...");
let configComplete = true;
let missingKeys: string[] = [];
Object.entries(firebaseConfig).forEach(([key, value]) => {
    if (!value) {
        const envVarName = `NEXT_PUBLIC_FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
        console.error(`[Firebase] Config missing: ${envVarName}`);
        missingKeys.push(envVarName);
        configComplete = false;
    }
});

if (!configComplete) {
    console.error(`[Firebase] Firebase configuration is incomplete. Missing variables: ${missingKeys.join(', ')}. Please check your environment variables in Vercel (Project Settings > Environment Variables). Ensure they are prefixed with NEXT_PUBLIC_.`);
    // Consider throwing an error only in development
    // if (process.env.NODE_ENV === 'development') {
    //   throw new Error("Firebase configuration is incomplete.");
    // }
} else {
    console.log("[Firebase] Firebase config loaded successfully. Project ID:", firebaseConfig.projectId);
}
// --- End Enhanced Logging ---


// Initialize Firebase
let app: FirebaseApp | null = null; // Initialize as null
let db: Firestore | null = null; // Initialize as null

try {
    // Check if config is complete before initializing
    if (configComplete) {
        if (!getApps().length) {
          console.log("[Firebase] Initializing Firebase app...");
          app = initializeApp(firebaseConfig);
          console.log("[Firebase] Firebase app initialized successfully.");
        } else {
          app = getApps()[0];
          console.log("[Firebase] Using existing Firebase app instance.");
        }
        db = getFirestore(app);
        console.log("[Firebase] Firestore instance obtained.");
    } else {
        console.error("[Firebase] Skipping Firebase initialization due to incomplete configuration.");
    }
} catch (error) {
    console.error("[Firebase] Error initializing Firebase or Firestore:", error);
    // Set db to null ensure checks later in the code handle this state
    db = null;
    // Optionally re-throw or handle more gracefully
    // throw new Error("Failed to initialize Firebase. Check configuration and network.");
}


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
  toFirestore(todo: WithFieldValue<Omit<Todo, 'id'>>): DocumentData { // Omit 'id' for saving
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
  fromFirestore(snapshot: QueryDocumentSnapshot): Todo { // Removed <DocumentData> for simplicity, types inferred
    const data = snapshot.data({ serverTimestamps: 'estimate' }); // Use estimate for smoother client-side updates
    // Convert Firestore Timestamp back to JavaScript Date safely
    const createdAt = data.createdAt instanceof Timestamp ? data.createdAt.toDate() : new Date(); // Default to now if invalid
    return {
      id: snapshot.id,
      text: data.text ?? 'No text', // Provide default if undefined
      completed: data.completed ?? false,
      createdAt: createdAt,
      date: data.date ?? null,
      type: data.type ?? 'global', // Default type if missing
    };
  }
};

// Get a reference to the collection with the converter applied - only if db is initialized
const todosCollection = db ? collection(db, 'todos').withConverter(todoConverter) : null;

// Get Todos function
export const getTodos = async (type: 'daily' | 'global', date?: string): Promise<Todo[]> => {
  let q;

  // --- Start Pre-fetch Checks ---
  console.log(`[getTodos] Attempting fetch - Type: ${type}, Date: ${date || 'N/A'}`);

  if (!db || !todosCollection) {
      console.error("[getTodos] Firestore DB or Collection reference is not initialized. Cannot fetch tasks. Check Firebase config and initialization logs.");
      // Return empty array or throw error based on desired behavior
      return [];
      // Or: throw new Error("Firestore is not available. Check configuration.");
  }

  // Re-check config values at the time of fetch (belt and suspenders)
  if (!firebaseConfig.projectId) {
      console.error("[getTodos] Firebase Project ID is missing at fetch time. Check Vercel environment variables (NEXT_PUBLIC_FIREBASE_PROJECT_ID).");
      return [];
  }
   console.log(`[getTodos] Pre-fetch checks passed. DB and Collection are available. Project ID: ${firebaseConfig.projectId}`);
   // --- End Pre-fetch Checks ---


  try {
      let queryDescription = `type == ${type}`; // Description for logging

      if (type === 'daily') {
        if (!date) {
            console.warn("[getTodos] Date is required for fetching daily todos, but not provided. Returning empty array.");
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

      console.log(`[getTodos] Executing Firestore query: ${queryDescription}, orderBy createdAt asc`);
      const querySnapshot = await getDocs(q);
      console.log(`[getTodos] Firestore query executed. Found ${querySnapshot.docs.length} documents.`);

      // Log raw snapshot data before conversion (optional, for deep debugging)
      // querySnapshot.docs.forEach(doc => console.log(`[getTodos] Raw doc data (ID: ${doc.id}):`, doc.data()));


      // Firestore automatically uses the converter here when mapping .data()
      const todos = querySnapshot.docs.map(doc => doc.data());

      // Log the *converted* data structure
      if (todos.length > 0) {
          console.log(`[getTodos] First CONVERTED todo (id: ${todos[0].id}):`, JSON.stringify(todos[0], null, 2)); // Log full structure safely
      } else {
          console.log("[getTodos] No todos found matching the query.");
      }

      return todos; // Return the converted todos
  } catch (error: any) { // Catch error as 'any' to access properties like 'code'
      console.error(`[getTodos] Error getting ${type} documents (Date: ${date}): `, error);
      // Check for specific Firebase errors if needed
      let errorMessage = `Failed to fetch ${type} tasks.`;
      if (error.code) {
        console.error("[getTodos] Firestore error code:", error.code);
        // Provide more specific messages based on common Vercel/Firestore issues
        if (error.code === 'permission-denied') {
            errorMessage = `Permission denied fetching ${type} tasks (Date: ${date}). Check Firestore security rules in Firebase Console. Ensure Vercel deployment has necessary permissions.`;
        } else if (error.code === 'unauthenticated') {
             errorMessage = `Authentication error fetching ${type} tasks. Check Firestore rules for auth requirements.`;
        } else if (error.code === 'unavailable') {
            errorMessage = `Firestore service unavailable. Check Firebase status (status.firebase.google.com) and Vercel network settings.`;
        } else if (error.code === 'internal') {
             errorMessage = `Firestore internal error (${error.code}). This might be transient. Check Firebase status.`;
        } else if (error.code === 'unimplemented') {
             errorMessage = `Firestore query requires an index. Check the error message in the console for a link to create the necessary index in the Firebase Console. Query: ${queryDescription}`;
        } else {
            errorMessage = `Firestore error (${error.code}) fetching ${type} tasks. Query: ${queryDescription}. Check console, Firestore rules, and indexes.`;
        }
      } else {
           errorMessage = `Failed to fetch ${type} tasks (Date: ${date}). Unknown error: ${error.message || error}. Check console, rules, and config.`;
      }
      // Throwing here will propagate the error to the calling component (TaskList)
      throw new Error(errorMessage);
  }
};


// Add Todo function
export const addTodo = async (todoData: Omit<Todo, 'id'>): Promise<Todo> => {
   if (!db || !todosCollection) {
        console.error("[addTodo] Firestore DB or Collection reference is not initialized. Cannot add task.");
        throw new Error("Firestore is not initialized. Check configuration.");
   }
   try {
     // Ensure createdAt is a valid Date object and other fields are present
     const dataToSave: Omit<Todo, 'id'> = {
       text: todoData.text || '', // Ensure text is not undefined
       completed: todoData.completed ?? false, // Default completed to false
       createdAt: new Date(), // Always use server time (or consistent client time)
       date: todoData.date, // Keep as provided (null for global, string for daily)
       type: todoData.type,
     };
     console.log(`[addTodo] Attempting to add todo:`, { text: dataToSave.text, type: dataToSave.type, date: dataToSave.date });
     // Use the collection reference with the converter
     // The converter handles the conversion to Firestore data types (e.g., Timestamp)
     const docRef = await addDoc(todosCollection, dataToSave);

     console.log(`[addTodo] Todo added successfully with ID: ${docRef.id}`);
     // Construct the full Todo object including the new ID and return it
     // Use the data that was intended to be saved, plus the generated ID
     return { ...dataToSave, id: docRef.id };
   } catch (error: any) {
     console.error("[addTodo] Error adding document: ", error);
     let errorMessage = "Failed to add task.";
      if (error.code) {
         errorMessage = `Failed to add task due to Firestore error (${error.code}). Check console and Firestore rules.`;
         if (error.code === 'permission-denied') {
             errorMessage = `Permission denied when adding task. Check Firestore rules.`;
         }
      } else {
          errorMessage = `Failed to add task. Unknown error: ${error.message || error}. Check console and Firestore rules.`;
      }
     throw new Error(errorMessage);
   }
};

// Update Todo function
export const updateTodo = async (id: string, updates: Partial<Pick<Todo, 'completed' | 'text'>>): Promise<void> => {
  if (!db) { // Use the base db check
    console.error("[updateTodo] Firestore is not initialized. Cannot update task.");
    throw new Error("Firestore is not initialized. Check configuration.");
  }
  // Get a non-converted doc reference for the update payload flexibility
  // Need to ensure db is valid before creating the doc ref
  const todoDocRef = doc(collection(db, 'todos'), id); // Create ref using base collection

   try {
    console.log(`[updateTodo] Attempting to update todo ${id} with:`, updates);
    // updateDoc doesn't use the converter automatically for the payload,
    // but it operates on the correct document path.
    await updateDoc(todoDocRef, updates);
    console.log(`[updateTodo] Todo updated successfully: ${id}`);
   } catch (error: any) {
     console.error(`[updateTodo] Error updating document ${id}: `, error);
     let errorMessage = "Failed to update task.";
      if (error.code) {
          errorMessage = `Failed to update task ${id} due to Firestore error (${error.code}). Check console and Firestore rules.`;
          if (error.code === 'permission-denied') {
             errorMessage = `Permission denied when updating task ${id}. Check Firestore rules.`;
          }
      } else {
          errorMessage = `Failed to update task ${id}. Unknown error: ${error.message || error}. Check console and Firestore rules.`;
      }
     throw new Error(errorMessage);
   }
};

// Delete Todo function
export const deleteTodo = async (id: string): Promise<void> => {
  if (!db) { // Use the base db check
    console.error("[deleteTodo] Firestore is not initialized. Cannot delete task.");
    throw new Error("Firestore is not initialized. Check configuration.");
  }
  // Create ref using base collection
  const todoDocRef = doc(collection(db, 'todos'), id);
   try {
     console.log(`[deleteTodo] Attempting to delete todo: ${id}`);
     await deleteDoc(todoDocRef);
     console.log(`[deleteTodo] Todo deleted successfully: ${id}`);
   } catch (error: any) {
     console.error(`[deleteTodo] Error deleting document ${id}: `, error);
     let errorMessage = "Failed to delete task.";
      if (error.code) {
          errorMessage = `Failed to delete task ${id} due to Firestore error (${error.code}). Check console and Firestore rules.`;
          if (error.code === 'permission-denied') {
             errorMessage = `Permission denied when deleting task ${id}. Check Firestore rules.`;
          }
      } else {
          errorMessage = `Failed to delete task ${id}. Unknown error: ${error.message || error}. Check console and Firestore rules.`;
      }
     throw new Error(errorMessage);
   }
};

// Export the db instance if needed elsewhere, but be cautious about direct use without checks
export { db };
