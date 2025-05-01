
"use client";

import { useState, useEffect, useCallback } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Plus } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { getTodos, addTodo, updateTodo, deleteTodo, Todo } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from "@/hooks/use-toast"; // Import useToast

interface TaskListProps {
  listType: 'daily' | 'global';
}

export function TaskList({ listType }: TaskListProps) {
  const [tasks, setTasks] = useState<Todo[]>([]);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(true); // Start loading true
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<string | null>(null); // Start null until set client-side
  const { toast } = useToast(); // Initialize toast

  // --- Debug Log: Component Mount & Initial State ---
  useEffect(() => {
    console.log(`[TaskList-${listType}] Component mounted. Initial state - loading: ${loading}, error: ${error}, tasks: ${tasks.length}, currentDate: ${currentDate}`);
    // --- Set Current Date on Client Side ---
    const today = format(new Date(), 'yyyy-MM-dd');
    console.log(`[TaskList-${listType}] Setting currentDate (client-side) to: ${today}`);
    setCurrentDate(today);
    // Note: Setting state here triggers a re-render, which will then trigger the fetchTasks effect if listType is 'daily'
  }, [listType]); // Only runs on mount for each list type


  // Fetch tasks whenever listType or currentDate changes (if relevant)
  useEffect(() => {
    console.log(`[TaskList-${listType}] Fetch effect triggered. Dependencies - listType: ${listType}, currentDate: ${currentDate}`);

    // Guard condition: For daily tasks, wait until currentDate is set by the *client-side* effect
    if (listType === 'daily' && !currentDate) {
        console.log(`[TaskList-${listType}] Skipping fetch for daily tasks because currentDate is still null (waiting for client-side effect).`);
        // Ensure loading remains true while waiting for the date
        if (!loading) setLoading(true);
        return;
    }

    // Guard condition: Don't fetch if already loading
    // if (loading) {
    //     console.log(`[TaskList-${listType}] Skipping fetch because 'loading' is already true.`);
    //     return;
    // }

    const fetchTasks = async () => {
      const fetchDate = listType === 'daily' ? currentDate : undefined;
      console.log(`[TaskList-${listType}] Starting fetchTasks. Type: ${listType}, Date used for query: ${fetchDate || 'N/A'}`);
      setLoading(true); // Set loading true *before* the async call
      setError(null); // Clear previous errors before fetching

      try {
        // --- Debug Log: Calling getTodos ---
        console.log(`[TaskList-${listType}] Calling getTodos with type='${listType}'${fetchDate ? ` and date='${fetchDate}'` : ''}...`);
        const fetchedTasks = await getTodos(listType, fetchDate);
        // --- Debug Log: Received Tasks ---
        console.log(`[TaskList-${listType}] Received ${fetchedTasks.length} tasks from getTodos.`);
        if(fetchedTasks.length > 0) {
            console.log(`[TaskList-${listType}] First fetched task:`, JSON.stringify(fetchedTasks[0]));
        }
        setTasks(fetchedTasks);
        console.log(`[TaskList-${listType}] State 'tasks' updated successfully.`);
        setError(null); // Explicitly clear error on success
      } catch (err: any) {
        // --- Debug Log: Fetch Error ---
        console.error(`[TaskList-${listType}] Error caught during getTodos call:`, err);
        const errorMessage = err.message || `Failed to load ${listType} tasks. Check console & network logs.`;
        console.error(`[TaskList-${listType}] Setting error state: "${errorMessage}"`);
        setError(errorMessage); // Set error state to display in UI
        setTasks([]); // Clear tasks on error to avoid showing stale data
        console.log(`[TaskList-${listType}] State 'tasks' cleared due to error.`);
        toast({ // Show error toast
            variant: "destructive",
            title: `Error loading ${listType} tasks`,
            description: errorMessage,
        });
      } finally {
        // --- Debug Log: Finished Fetch ---
        console.log(`[TaskList-${listType}] Finished fetchTasks (finally block). Setting loading to false.`);
        setLoading(false); // Set loading false after fetch attempt (success or fail)
      }
    };

    fetchTasks();
    // Dependency array includes currentDate which is crucial for daily tasks
  }, [listType, currentDate, toast]); // Include all dependencies that trigger the effect

  const handleAddTask = async (e: FormEvent) => {
    e.preventDefault();
    console.log(`[TaskList-${listType}] handleAddTask triggered.`);
    const trimmedTask = newTask.trim();
    if (!trimmedTask) {
        console.log(`[TaskList-${listType}] Add task aborted: Task input is empty.`);
        return;
    }
    if (listType === 'daily' && !currentDate) {
        const msg = "Cannot add daily task: Date not initialized.";
        console.error(`[TaskList-${listType}] Add task failed: ${msg}`);
        setError(msg);
        toast({ variant: "destructive", title: "Error", description: msg });
        return;
     }

    const taskToAdd: Omit<Todo, 'id'> = {
      text: trimmedTask,
      completed: false,
      createdAt: new Date(), // Use current date/time for creation
      date: listType === 'daily' ? currentDate : null, // Use the state variable
      type: listType,
    };
    console.log(`[TaskList-${listType}] Prepared task object for addition:`, taskToAdd);

    const optimisticId = `temp-${Date.now()}`; // Create a temporary ID for optimistic update
    const optimisticTask: Todo = { ...taskToAdd, id: optimisticId };

    setNewTask(''); // Optimistically clear input
    setTasks((prevTasks) => {
        console.log(`[TaskList-${listType}] Optimistically adding task ID: ${optimisticId}`);
        return [...prevTasks, optimisticTask];
    });
    setError(null); // Clear previous errors

    try {
      console.log(`[TaskList-${listType}] Calling addTodo for task: "${trimmedTask}"...`);
      const addedTodo = await addTodo(taskToAdd);
      console.log(`[TaskList-${listType}] addTodo successful. Received task from backend:`, addedTodo);
      // Replace optimistic task with the real one from backend
      setTasks((prevTasks) => {
        console.log(`[TaskList-${listType}] Replacing optimistic task ${optimisticId} with real task ${addedTodo.id}`);
        return prevTasks.map((task) => (task.id === optimisticId ? addedTodo : task));
      });
       toast({ // Success toast
         title: "Task Added",
         description: `"${addedTodo.text}" was added successfully.`,
       });
       console.log(`[TaskList-${listType}] Add task process completed successfully.`);
    } catch (err: any) {
        console.error(`[TaskList-${listType}] Error caught during addTodo call:`, err);
        const errorMessage = err.message || `Failed to add task. Please try again.`;
        setError(errorMessage);
        // Revert optimistic update
        setTasks((prevTasks) => {
            console.log(`[TaskList-${listType}] Reverting optimistic add for task ID: ${optimisticId}`);
            return prevTasks.filter((task) => task.id !== optimisticId);
        });
        setNewTask(trimmedTask); // Restore input content
        toast({ // Error toast
          variant: "destructive",
          title: "Error adding task",
          description: errorMessage,
        });
         console.error(`[TaskList-${listType}] Add task process failed.`);
    }
  };

  const handleToggleComplete = async (id: string, completed: boolean) => {
      console.log(`[TaskList-${listType}] handleToggleComplete triggered for task ID: ${id}, current completed: ${completed}`);
      const originalTasks = [...tasks];
      // Optimistically update UI
      setTasks((prevTasks) => {
        console.log(`[TaskList-${listType}] Optimistically toggling completed status for task ID: ${id} to ${!completed}`);
        return prevTasks.map((task) =>
          task.id === id ? { ...task, completed: !completed } : task
        );
      });
      setError(null); // Clear previous errors

    try {
      console.log(`[TaskList-${listType}] Calling updateTodo for task ${id}, setting completed to ${!completed}...`);
      await updateTodo(id, { completed: !completed });
      console.log(`[TaskList-${listType}] updateTodo successful for task ${id}.`);
       toast({ // Success toast
         title: "Task Updated",
         description: `Task status changed.`,
       });
       console.log(`[TaskList-${listType}] Toggle complete process completed successfully.`);
    } catch (err: any) {
        console.error(`[TaskList-${listType}] Error caught during updateTodo call for task ${id}:`, err);
        const errorMessage = err.message || `Failed to update task status. Please try again.`;
        setError(errorMessage);
         // Revert optimistic update on failure
        setTasks((prevTasks) => {
           console.log(`[TaskList-${listType}] Reverting optimistic toggle for task ID: ${id}`);
           return originalTasks; // Restore previous state
        });
        toast({ // Error toast
            variant: "destructive",
            title: "Error updating task",
            description: errorMessage,
        });
         console.error(`[TaskList-${listType}] Toggle complete process failed.`);
    }
  };

  const handleDeleteTask = async (id: string, text: string) => {
      console.log(`[TaskList-${listType}] handleDeleteTask triggered for task ID: ${id}, text: "${text}"`);
      const originalTasks = [...tasks];
      // Optimistically update UI
      setTasks((prevTasks) => {
          console.log(`[TaskList-${listType}] Optimistically removing task ID: ${id}`);
          return prevTasks.filter((task) => task.id !== id);
      });
      setError(null); // Clear previous errors

    try {
      console.log(`[TaskList-${listType}] Calling deleteTodo for task ID: ${id}...`);
      await deleteTodo(id);
      console.log(`[TaskList-${listType}] deleteTodo successful for task ID: ${id}.`);
       toast({ // Success toast
         title: "Task Deleted",
         description: `"${text}" was deleted.`,
       });
       console.log(`[TaskList-${listType}] Delete task process completed successfully.`);
    } catch (err: any) {
      console.error(`[TaskList-${listType}] Error caught during deleteTodo call for task ${id}:`, err);
      const errorMessage = err.message || `Failed to delete task. Please try again.`;
      setError(errorMessage);
      // Revert optimistic update on failure
      setTasks((prevTasks) => {
          console.log(`[TaskList-${listType}] Reverting optimistic delete for task ID: ${id}`);
          return originalTasks; // Restore previous state
      });
      toast({ // Error toast
          variant: "destructive",
          title: "Error deleting task",
          description: errorMessage,
      });
      console.error(`[TaskList-${listType}] Delete task process failed.`);
    }
  };

  // Filter tasks based on completion status (sorting is now done by Firestore)
  const incompleteTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);
  console.log(`[TaskList-${listType}] Filtering complete. Incomplete: ${incompleteTasks.length}, Completed: ${completedTasks.length}`);


  // Format date for display, handle case where currentDate might not be set yet
   const displayDate = listType === 'daily'
    ? (currentDate ? format(new Date(currentDate + 'T00:00:00'), 'MMMM d, yyyy') : 'Loading date...')
    : '';
    console.log(`[TaskList-${listType}] Rendering TaskList. Display Date: ${displayDate}, Loading: ${loading}, Error: ${error}`);


  return (
    <div className="flex flex-col h-full">
      <h2 className="text-2xl font-semibold mb-4 text-secondary-foreground">
        {listType === 'daily' ? `Today's Tasks (${displayDate})` : 'Global Tasks'}
      </h2>

       {/* Display error if not loading and an error exists */}
       {error && !loading && (
         <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4 text-sm border border-destructive/30">
             <p className="font-semibold">Error:</p>
             <p>{error}</p> {/* Display the error message */}
             {console.log(`[TaskList-${listType}] Rendering ERROR message: "${error}"`)}
         </div>
       )}

      <form onSubmit={handleAddTask} className="flex gap-2 mb-6">
        <Input
          type="text"
          value={newTask}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTask(e.target.value)}
          placeholder={`Add a new ${listType} task...`}
          className="flex-grow"
          aria-label={`New ${listType} task`}
           // Disable if it's daily tasks and date isn't ready OR if an error occurred OR if loading
          disabled={(listType === 'daily' && !currentDate) || !!error || loading}
        />
        <Button
           type="submit"
           // Disable if no text, loading, daily tasks and date isn't ready, OR error occurred
           disabled={!newTask.trim() || loading || (listType === 'daily' && !currentDate) || !!error}
           aria-label={`Add ${listType} task`}
           // Pass loading state directly to the Button component's prop
           loading={loading && !error} // Show loading only if actively loading and no error shown
        >
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </form>

      <div className="flex-grow overflow-y-auto space-y-2 pr-1 scroll-smooth">
        {/* Show loading skeletons ONLY when loading AND no error is present */}
        {loading && !error && (
           <div className="space-y-3">
             <p className="text-muted-foreground text-center mt-8">Loading tasks...</p>
              {console.log(`[TaskList-${listType}] Rendering LOADING state.`)}
             <TaskItemSkeleton />
             <TaskItemSkeleton />
             <TaskItemSkeleton />
           </div>
         )}

         {/* Show content only if NOT loading OR if there's an error (to show the error message above) */}
         {!loading || error ? (
          <>
             {/* Show "No tasks" only if NOT loading, NO error, and tasks array is empty */}
             {!loading && !error && tasks.length === 0 && (
              <p className="text-muted-foreground text-center mt-8">
                No {listType} tasks yet. Add one above!
                {console.log(`[TaskList-${listType}] Rendering 'No tasks' message.`)}
              </p>
            )}

            {/* Render tasks only if there are tasks AND (we are not loading OR there is an error - error message shown above) */}
            {/* This logic might be slightly complex, ensure it covers all cases. Essentially, render if not loading, or if loading finished with an error */}
            {tasks.length > 0 && (!loading || error) && (
               <>
                 {console.log(`[TaskList-${listType}] Rendering task items. Incomplete: ${incompleteTasks.length}, Completed: ${completedTasks.length}`)}
                 {incompleteTasks.length > 0 && (
                   <div className="space-y-2">
                     {incompleteTasks.map((task) => (
                       <TaskItem
                         key={task.id}
                         task={task}
                         onToggleComplete={handleToggleComplete}
                         onDelete={handleDeleteTask}
                       />
                     ))}
                   </div>
                 )}

                 {completedTasks.length > 0 && incompleteTasks.length > 0 && (
                   <Separator className="my-4" />
                 )}

                 {completedTasks.length > 0 && (
                   <div className="space-y-2">
                     <h3 className="text-sm font-medium text-muted-foreground mb-2 px-3">Completed</h3>
                     {completedTasks.map((task) => (
                       <TaskItem
                         key={task.id}
                         task={task}
                         onToggleComplete={handleToggleComplete}
                         onDelete={handleDeleteTask}
                       />
                     ))}
                   </div>
                 )}
               </>
            )}

           </>
        ) : null} {/* End of content block */}
      </div>
    </div>
  );
}

interface TaskItemProps {
  task: Todo;
  onToggleComplete: (id: string, completed: boolean) => void;
  onDelete: (id: string, text: string) => void; // Pass text for toast message
}

function TaskItem({ task, onToggleComplete, onDelete }: TaskItemProps) {
    // console.log(`[TaskItem] Rendering task ID: ${task.id}, Text: "${task.text}", Completed: ${task.completed}`); // Frequent logging, uncomment if needed
  return (
    <div className={cn(
        "flex items-center gap-3 p-3 rounded-md transition-colors duration-150 ease-in-out group", // Add group for hover effects
        task.completed ? 'bg-muted/40 hover:bg-muted/60' : 'bg-card hover:bg-secondary/30'
      )}
     >
      <Checkbox
        id={`task-${task.id}`}
        checked={task.completed}
        onCheckedChange={() => onToggleComplete(task.id, task.completed)}
        aria-label={task.completed ? `Mark task "${task.text}" as incomplete` : `Mark task "${task.text}" as complete`}
        className="transition-transform duration-150 ease-in-out data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground mt-px flex-shrink-0" // Adjusted styles
      />
      <label
        htmlFor={`task-${task.id}`}
        className={cn(
          "flex-grow cursor-pointer text-sm break-words", // Allow text wrapping
          task.completed && "line-through text-muted-foreground"
        )}
      >
        {task.text}
      </label>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(task.id, task.text)} // Pass text to onDelete
        className="text-muted-foreground/50 hover:text-destructive h-8 w-8 transition-colors duration-150 ease-in-out opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0" // Show on hover/focus
        aria-label={`Delete task: ${task.text}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}


function TaskItemSkeleton() {
  // console.log("[TaskItemSkeleton] Rendering skeleton."); // Frequent logging, uncomment if needed
  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30">
       <Skeleton className="h-5 w-5 rounded-sm flex-shrink-0" />
       <Skeleton className="h-4 flex-grow rounded max-w-[70%]" />
       <Skeleton className="h-8 w-8 rounded flex-shrink-0" />
    </div>
  );
}

