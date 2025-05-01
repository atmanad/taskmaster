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


// Get Todos function
export const getTodos = async (type: 'daily' | 'global', date?: string): Promise<Todo[]> => {
  let q;

  // --- Start Pre-fetch Checks ---
  console.log(`[getTodos] Initiating fetch - Type: ${type}, Date: ${date || 'N/A'}`);

  // Log the environment variable value *at the time of the call*
  const currentProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  console.log(`[getTodos] Current NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${currentProjectId}`);

  if (!db || !todosCollection) {
      console.error("[getTodos] CRITICAL: Firestore DB or Collection reference is not initialized. Cannot fetch tasks. Check Firebase config and initialization logs.");
      // Return empty array or throw error based on desired behavior
      return [];
      // Or: throw new Error("Firestore is not available. Check configuration.");
  }

  // Re-check config values at the time of fetch (belt and suspenders)
  if (!firebaseConfig.projectId || !currentProjectId) {
      console.error("[getTodos] CRITICAL: Firebase Project ID is missing at fetch time. Check environment variables (e.g., NEXT_PUBLIC_FIREBASE_PROJECT_ID). Config value:", firebaseConfig.projectId, "process.env value:", currentProjectId);
      return [];
  }
   console.log(`[getTodos] Pre-fetch checks passed. DB and Collection are available. Project ID confirmed: ${currentProjectId}`);
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
        console.log(`[getTodos] Constructed Firestore query for DAILY tasks: where type == 'daily', where date == '${date}', orderBy createdAt asc`);
      } else {
        // Query for tasks matching only the 'global' type, ordered by creation time
        q = query(
            todosCollection, // Use the converter-applied collection
            where('type', '==', 'global'),
            orderBy('createdAt', 'asc') // Order by creation time ascending
        );
        console.log("[getTodos] Constructed Firestore query for GLOBAL tasks: where type == 'global', orderBy createdAt asc");
      }

      console.log(`[getTodos] Executing Firestore query...`);
      const querySnapshot = await getDocs(q);
      console.log(`[getTodos] Firestore query executed. Found ${querySnapshot.docs.length} raw documents.`);

      // Log raw snapshot data before conversion (optional, for deep debugging)
      if (querySnapshot.docs.length > 0) {
          console.log("[getTodos] -------- Raw Document Data Start --------")
          querySnapshot.docs.forEach(doc => {
              console.log(`[getTodos] Raw doc ID: ${doc.id}, Data:`, JSON.stringify(doc.data({ serverTimestamps: 'none' }))); // Log raw data without estimates
          });
          console.log("[getTodos] -------- Raw Document Data End --------")
      } else {
          console.log("[getTodos] No raw documents found matching the query.");
      }


      // Firestore automatically uses the converter here when mapping .data()
      // Explicitly call the converter for clarity in logs
      console.log("[getTodos] Starting conversion of raw documents using todoConverter.fromFirestore...");
      const todos = querySnapshot.docs.map(doc => {
          console.log(`[getTodos] Converting document ID: ${doc.id}`);
          // The .data() call here implicitly uses the converter attached to todosCollection
          try {
              const convertedData = doc.data(); // This triggers fromFirestore
              console.log(`[getTodos] Successfully converted document ID: ${doc.id}`);
              return convertedData;
          } catch (conversionError) {
              console.error(`[getTodos] Error converting document ID: ${doc.id}`, conversionError);
              console.error(`[getTodos] Raw data for failed conversion:`, doc.data({ serverTimestamps: 'none' }));
              return null; // Return null for failed conversions
          }
      }).filter(todo => todo !== null) as Todo[]; // Filter out any nulls from failed conversions

      console.log(`[getTodos] Finished conversion. Number of successfully converted todos: ${todos.length}`);

      // Log the *converted* data structure
      if (todos.length > 0) {
          console.log(`[getTodos] First CONVERTED todo (id: ${todos[0].id}):`, JSON.stringify(todos[0], null, 2)); // Log full structure safely
      } else {
          console.log("[getTodos] No todos after conversion (either none found or conversion failed).");
      }

      console.log("[getTodos] Fetch successful. Returning converted todos.");
      return todos; // Return the converted todos
  } catch (error: any) { // Catch error as 'any' to access properties like 'code'
      console.error(`[getTodos] CATCH BLOCK: Error getting ${type} documents (Date: ${date}): `, error);
      console.error(`[getTodos] Error Details: Code: ${error.code}, Message: ${error.message}, Stack: ${error.stack}`);
      // Check for specific Firebase errors if needed
      let errorMessage = `Failed to fetch ${type} tasks.`;
      if (error.code) {
        console.error("[getTodos] Firestore error code:", error.code);
        // Provide more specific messages based on common Vercel/Firestore issues
        if (error.code === 'permission-denied') {
            errorMessage = `Permission denied fetching ${type} tasks (Date: ${date}). Check Firestore security rules in Firebase Console. Ensure the environment running the code has necessary permissions.`;
        } else if (error.code === 'unauthenticated') {
             errorMessage = `Authentication error fetching ${type} tasks. Check Firestore rules for auth requirements.`;
        } else if (error.code === 'unavailable') {
            errorMessage = `Firestore service unavailable. Check Firebase status (status.firebase.google.com) and network settings.`;
        } else if (error.code === 'internal') {
             errorMessage = `Firestore internal error (${error.code}). This might be transient. Check Firebase status.`;
        } else if (error.code === 'unimplemented' || error.message?.toLowerCase().includes('index')) {
             errorMessage = `Firestore query requires an index. Check the error message in the console/logs for a link to create the necessary index in the Firebase Console. Query: ${queryDescription}`;
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
   console.log("[addTodo] Initiating add operation...");
   if (!db || !todosCollection) {
        console.error("[addTodo] CRITICAL: Firestore DB or Collection reference is not initialized. Cannot add task.");
        throw new Error("Firestore is not initialized. Check configuration.");
   }
   try {
     // Ensure createdAt is a valid Date object and other fields are present
     const dataToSave: Omit<Todo, 'id'> = {
       text: todoData.text || '', // Ensure text is not undefined
       completed: todoData.completed ?? false, // Default completed to false
       createdAt: new Date(), // Always use current date/time for creation
       date: todoData.date, // Keep as provided (null for global, string for daily)
       type: todoData.type,
     };
     console.log(`[addTodo] Data prepared for Firestore:`, dataToSave);
     // Use the collection reference with the converter
     // The converter handles the conversion to Firestore data types (e.g., Timestamp)
     console.log(`[addTodo] Calling addDoc on todosCollection...`);
     const docRef = await addDoc(todosCollection, dataToSave); // This triggers toFirestore

     console.log(`[addTodo] addDoc successful. New document ID: ${docRef.id}`);
     // Construct the full Todo object including the new ID and return it
     // Use the data that was intended to be saved, plus the generated ID
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

// Update Todo function
export const updateTodo = async (id: string, updates: Partial<Pick<Todo, 'completed' | 'text'>>): Promise<void> => {
  console.log(`[updateTodo] Initiating update for doc ID: ${id} with updates:`, updates);
  if (!db) { // Use the base db check
    console.error("[updateTodo] CRITICAL: Firestore is not initialized. Cannot update task.");
    throw new Error("Firestore is not initialized. Check configuration.");
  }
  // Get a non-converted doc reference for the update payload flexibility
  // Need to ensure db is valid before creating the doc ref
  const todoDocRef = doc(collection(db, 'todos'), id); // Create ref using base collection
  console.log(`[updateTodo] Document reference created for ID: ${id}`);

   try {
    console.log(`[updateTodo] Calling updateDoc...`);
    // updateDoc doesn't use the converter automatically for the payload,
    // but it operates on the correct document path.
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

// Delete Todo function
export const deleteTodo = async (id: string): Promise<void> => {
  console.log(`[deleteTodo] Initiating delete for doc ID: ${id}`);
  if (!db) { // Use the base db check
    console.error("[deleteTodo] CRITICAL: Firestore is not initialized. Cannot delete task.");
    throw new Error("Firestore is not initialized. Check configuration.");
  }
  // Create ref using base collection
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
