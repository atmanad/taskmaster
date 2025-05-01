
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
  // No longer importing orderBy here as sorting will be done client-side
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
    console.error(`[Firebase] Firebase configuration is incomplete. Missing variables: ${missingKeys.join(', ')}. Please check your environment variables (e.g., in .env.local or hosting provider settings). Ensure they are prefixed with NEXT_PUBLIC_.`);
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
    console.log("[todoConverter - toFirestore] Converting Todo to Firestore data:", todo);
    // Ensure createdAt is always a Date before converting
    const createdAtDate = todo.createdAt instanceof Date ? todo.createdAt : new Date();
    const firestoreData = {
      text: todo.text,
      completed: todo.completed,
      // Store dates as Firestore Timestamps for proper querying/sorting
      createdAt: Timestamp.fromDate(createdAtDate),
      date: todo.date,
      type: todo.type,
    };
    console.log("[todoConverter - toFirestore] Resulting Firestore data:", firestoreData);
    return firestoreData;
  },
  fromFirestore(snapshot: QueryDocumentSnapshot): Todo { // Removed <DocumentData> for simplicity, types inferred
    console.log(`[todoConverter - fromFirestore] Converting snapshot (ID: ${snapshot.id}) to Todo...`);
    const data = snapshot.data({ serverTimestamps: 'estimate' }); // Use estimate for smoother client-side updates
    console.log(`[todoConverter - fromFirestore] Raw data from snapshot (ID: ${snapshot.id}):`, data);
    // Convert Firestore Timestamp back to JavaScript Date safely
    let createdAt: Date;
    if (data.createdAt instanceof Timestamp) {
        createdAt = data.createdAt.toDate();
        console.log(`[todoConverter - fromFirestore] Converted 'createdAt' Timestamp to Date: ${createdAt.toISOString()}`);
    } else {
        console.warn(`[todoConverter - fromFirestore] 'createdAt' field is not a Timestamp for doc ${snapshot.id}. Using current date as fallback. Raw value:`, data.createdAt);
        createdAt = new Date(); // Default to now if invalid
    }
    const convertedTodo = {
      id: snapshot.id,
      text: data.text ?? 'No text', // Provide default if undefined
      completed: data.completed ?? false,
      createdAt: createdAt,
      date: data.date ?? null,
      type: data.type ?? 'global', // Default type if missing
    };
     console.log(`[todoConverter - fromFirestore] Successfully converted snapshot (ID: ${snapshot.id}) to Todo:`, convertedTodo);
    return convertedTodo;
  }
};

// Get a reference to the collection with the converter applied - only if db is initialized
const todosCollection = db ? collection(db, 'todos').withConverter(todoConverter) : null;
if (!todosCollection) {
    console.error("[Firebase Init] 'todosCollection' is null. Firestore interaction will fail.");
} else {
    console.log("[Firebase Init] 'todosCollection' reference created successfully.");
}


// Get Todos function (Modified to fetch all by type and filter/sort client-side)
export const getTodos = async (type: 'daily' | 'global', date?: string): Promise<Todo[]> => {
  // --- Start Pre-fetch Checks ---
  console.log(`[getTodos - Client Filter] Initiating fetch - Type: ${type}, Date for filtering (if daily): ${date || 'N/A'}`);

  const currentProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  console.log(`[getTodos - Client Filter] Current NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${currentProjectId}`);

  if (!db || !todosCollection) {
      console.error("[getTodos - Client Filter] CRITICAL: Firestore DB or Collection reference is not initialized. Cannot fetch tasks.");
      return [];
  }

  if (!firebaseConfig.projectId || !currentProjectId) {
      console.error("[getTodos - Client Filter] CRITICAL: Firebase Project ID is missing at fetch time.");
      return [];
  }
   console.log(`[getTodos - Client Filter] Pre-fetch checks passed. DB and Collection are available. Project ID confirmed: ${currentProjectId}`);
   // --- End Pre-fetch Checks ---

   let queryDescription = `type == ${type}`; // Description for logging

   try {
      // Simplified query: Fetch all documents matching the 'type' only.
      // Removed where('date', ...) and orderBy(...) to avoid composite index requirement.
      const q = query(
          todosCollection,
          where('type', '==', type)
      );
      console.log(`[getTodos - Client Filter] Constructed simple Firestore query: where type == '${type}'`);

      console.log(`[getTodos - Client Filter] Executing Firestore query...`);
      const querySnapshot = await getDocs(q);
      console.log(`[getTodos - Client Filter] Firestore query executed. Found ${querySnapshot.docs.length} raw documents of type '${type}'.`);

      // Conversion (same as before)
      console.log("[getTodos - Client Filter] Starting conversion of raw documents using todoConverter.fromFirestore...");
      const allTodosOfType = querySnapshot.docs.map(doc => {
          try {
              const convertedData = doc.data(); // This triggers fromFirestore
              return convertedData;
          } catch (conversionError) {
              console.error(`[getTodos - Client Filter] Error converting document ID: ${doc.id}`, conversionError);
              return null;
          }
      }).filter(todo => todo !== null) as Todo[];
      console.log(`[getTodos - Client Filter] Finished conversion. ${allTodosOfType.length} todos of type '${type}' converted.`);

      // Client-side Filtering (for daily tasks) and Sorting
      let finalTodos: Todo[];
      if (type === 'daily') {
        if (!date) {
          console.warn("[getTodos - Client Filter] Date is required for filtering daily todos, but not provided. Returning empty array.");
          return [];
        }
        console.log(`[getTodos - Client Filter] Filtering daily tasks client-side for date: ${date}`);
        finalTodos = allTodosOfType.filter(todo => todo.date === date);
        console.log(`[getTodos - Client Filter] Found ${finalTodos.length} daily tasks matching the date after client-side filtering.`);
      } else {
        finalTodos = allTodosOfType; // No date filtering needed for global tasks
        console.log(`[getTodos - Client Filter] Using all ${finalTodos.length} global tasks (no date filtering).`);
      }

      // Client-side Sorting by createdAt
      console.log(`[getTodos - Client Filter] Sorting ${finalTodos.length} tasks client-side by createdAt ascending...`);
      finalTodos.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      // Log the *final, filtered, and sorted* data structure
      if (finalTodos.length > 0) {
          console.log(`[getTodos - Client Filter] First final todo (id: ${finalTodos[0].id}):`, JSON.stringify(finalTodos[0], null, 2));
      } else {
          console.log("[getTodos - Client Filter] No todos remaining after client-side filtering/sorting.");
      }

      console.log("[getTodos - Client Filter] Fetch and client-side processing successful. Returning final todos.");
      return finalTodos;

   } catch (error: any) {
       console.error(`[getTodos - Client Filter] CATCH BLOCK: Error during Firestore fetch for type ${type}: `, error);
       console.error(`[getTodos - Client Filter] Error Details: Code: ${error.code}, Message: ${error.message}, Stack: ${error.stack}`);
       let errorMessage = `Failed to fetch ${type} tasks.`;
       if (error.code) {
           // Less likely to hit index errors now, but keep other checks
           if (error.code === 'permission-denied') {
               errorMessage = `Permission denied fetching ${type} tasks. Check Firestore security rules.`;
           } else {
                errorMessage = `Firestore error (${error.code}) fetching ${type} tasks. Query: ${queryDescription}. Check console, Firestore rules.`;
           }
       } else {
           errorMessage = `Failed to fetch ${type} tasks. Unknown error: ${error.message || error}. Check console, rules, and config.`;
       }
       throw new Error(errorMessage);
   }
};


// Add Todo function (remains the same)
export const addTodo = async (todoData: Omit<Todo, 'id'>): Promise<Todo> => {
   console.log("[addTodo] Initiating add operation...");
   if (!db || !todosCollection) {
        console.error("[addTodo] CRITICAL: Firestore DB or Collection reference is not initialized. Cannot add task.");
        throw new Error("Firestore is not initialized. Check configuration.");
   }
   try {
     const dataToSave: Omit<Todo, 'id'> = {
       text: todoData.text || '',
       completed: todoData.completed ?? false,
       createdAt: new Date(),
       date: todoData.date,
       type: todoData.type,
     };
     console.log(`[addTodo] Data prepared for Firestore:`, dataToSave);
     console.log(`[addTodo] Calling addDoc on todosCollection...`);
     const docRef = await addDoc(todosCollection, dataToSave); // This triggers toFirestore

     console.log(`[addTodo] addDoc successful. New document ID: ${docRef.id}`);
     const addedTodo = { ...dataToSave, id: docRef.id };
     console.log(`[addTodo] Returning successfully added Todo:`, addedTodo);
     return addedTodo;
   } catch (error: any) {
     console.error("[addTodo] CATCH BLOCK: Error adding document: ", error);
     console.error(`[addTodo] Error Details: Code: ${error.code}, Message: ${error.message}, Stack: ${error.stack}`);
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

// Update Todo function (remains the same)
export const updateTodo = async (id: string, updates: Partial<Pick<Todo, 'completed' | 'text'>>): Promise<void> => {
  console.log(`[updateTodo] Initiating update for doc ID: ${id} with updates:`, updates);
  if (!db) {
    console.error("[updateTodo] CRITICAL: Firestore is not initialized. Cannot update task.");
    throw new Error("Firestore is not initialized. Check configuration.");
  }
  const todoDocRef = doc(collection(db, 'todos'), id);
  console.log(`[updateTodo] Document reference created for ID: ${id}`);

   try {
    console.log(`[updateTodo] Calling updateDoc...`);
    await updateDoc(todoDocRef, updates);
    console.log(`[updateTodo] updateDoc successful for ID: ${id}`);
   } catch (error: any) {
     console.error(`[updateTodo] CATCH BLOCK: Error updating document ${id}: `, error);
     console.error(`[updateTodo] Error Details: Code: ${error.code}, Message: ${error.message}, Stack: ${error.stack}`);
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

// Delete Todo function (remains the same)
export const deleteTodo = async (id: string): Promise<void> => {
  console.log(`[deleteTodo] Initiating delete for doc ID: ${id}`);
  if (!db) {
    console.error("[deleteTodo] CRITICAL: Firestore is not initialized. Cannot delete task.");
    throw new Error("Firestore is not initialized. Check configuration.");
  }
  const todoDocRef = doc(collection(db, 'todos'), id);
  console.log(`[deleteTodo] Document reference created for ID: ${id}`);
   try {
     console.log(`[deleteTodo] Calling deleteDoc...`);
     await deleteDoc(todoDocRef);
     console.log(`[deleteTodo] deleteDoc successful for ID: ${id}`);
   } catch (error: any) {
     console.error(`[deleteTodo] CATCH BLOCK: Error deleting document ${id}: `, error);
      console.error(`[deleteTodo] Error Details: Code: ${error.code}, Message: ${error.message}, Stack: ${error.stack}`);
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
