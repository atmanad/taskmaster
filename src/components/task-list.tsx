
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
  const [currentDate, setCurrentDate] = useState<string>(''); // Initialize empty, will be set client-side
  const { toast } = useToast(); // Initialize toast

  // --- Debug Log: Component Mount ---
  useEffect(() => {
    console.log(`[TaskList-${listType}] Component mounted.`);
    // --- Debug Log: Set Current Date ---
    const today = format(new Date(), 'yyyy-MM-dd');
    console.log(`[TaskList-${listType}] Setting currentDate to: ${today}`);
    setCurrentDate(today);
  }, [listType]); // Add listType to dependencies to log separately


  // Fetch tasks whenever listType or currentDate changes (if relevant)
  useEffect(() => {
    console.log(`[TaskList-${listType}] Effect triggered. listType: ${listType}, currentDate: ${currentDate}`);
    // Prevent fetching daily tasks until currentDate is actually set by the client-side effect
    if (listType === 'daily' && !currentDate) {
        console.log(`[TaskList-${listType}] Skipping fetch for daily tasks, currentDate not yet set.`);
        // Keep loading true until date is set, maybe show specific loading state?
        // setLoading(true); // Ensure loading remains true
        return;
    }

    const fetchTasks = async () => {
      console.log(`[TaskList-${listType}] Starting fetchTasks for ${listType}, date: ${currentDate || 'N/A'}`);
      setLoading(true); // Set loading true before fetch
      setError(null);
      try {
        // --- Debug Log: Calling getTodos ---
        console.log(`[TaskList-${listType}] Calling getTodos...`);
        const fetchedTasks = await getTodos(listType, listType === 'daily' ? currentDate : undefined);
        // --- Debug Log: Received Tasks ---
        console.log(`[TaskList-${listType}] Received ${fetchedTasks.length} tasks from getTodos:`, fetchedTasks);
        setTasks(fetchedTasks);
        setError(null); // Clear any previous errors on successful fetch
      } catch (err: any) {
        // --- Debug Log: Fetch Error ---
        console.error(`[TaskList-${listType}] Error fetching tasks:`, err);
        const errorMessage = err.message || `Failed to load ${listType} tasks. Please check console & network logs.`;
        setError(errorMessage); // Set error state to display in UI
        toast({ // Show error toast
            variant: "destructive",
            title: `Error loading ${listType} tasks`,
            description: errorMessage,
        });
        setTasks([]); // Clear tasks on error to avoid showing stale data
      } finally {
        // --- Debug Log: Finished Fetch ---
        console.log(`[TaskList-${listType}] Finished fetchTasks. Setting loading to false.`);
        setLoading(false); // Set loading false after fetch attempt (success or fail)
      }
    };

    fetchTasks();
    // Dependency array includes currentDate ONLY for daily tasks to avoid unnecessary fetches for global
  }, [listType, currentDate, toast]); // Include all dependencies that trigger the effect

  const handleAddTask = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTask = newTask.trim();
    if (!trimmedTask) return;
    if (listType === 'daily' && !currentDate) {
        const msg = "Cannot add daily task: Date not initialized.";
        console.error(`[TaskList-${listType}] ${msg}`);
        setError(msg);
        toast({ variant: "destructive", title: "Error", description: msg });
        return;
     }

    const taskToAdd: Omit<Todo, 'id'> = {
      text: trimmedTask,
      completed: false,
      createdAt: new Date(), // Use current date/time for creation
      date: listType === 'daily' ? currentDate : null,
      type: listType,
    };

    const optimisticId = `temp-${Date.now()}`; // Create a temporary ID for optimistic update
    const optimisticTask: Todo = { ...taskToAdd, id: optimisticId };

    setNewTask(''); // Optimistically clear input
    setTasks((prevTasks) => [...prevTasks, optimisticTask]); // Optimistically add task
    setError(null); // Clear previous errors

    try {
      console.log(`[TaskList-${listType}] Calling addTodo for task: "${trimmedTask}"`);
      const addedTodo = await addTodo(taskToAdd);
      console.log(`[TaskList-${listType}] addTodo successful. New task:`, addedTodo);
      // Replace optimistic task with the real one from backend
      setTasks((prevTasks) =>
        prevTasks.map((task) => (task.id === optimisticId ? addedTodo : task))
      );
       toast({ // Success toast
         title: "Task Added",
         description: `"${addedTodo.text}" was added successfully.`,
       });
    } catch (err: any) {
        console.error(`[TaskList-${listType}] Error adding task:`, err);
        const errorMessage = err.message || `Failed to add task. Please try again.`;
        setError(errorMessage);
        // Revert optimistic update
        setTasks((prevTasks) => prevTasks.filter((task) => task.id !== optimisticId));
        setNewTask(trimmedTask); // Restore input content
        toast({ // Error toast
          variant: "destructive",
          title: "Error adding task",
          description: errorMessage,
        });
    }
  };

  const handleToggleComplete = async (id: string, completed: boolean) => {
      const originalTasks = [...tasks];
      // Optimistically update UI
      setTasks((prevTasks) =>
        prevTasks.map((task) =>
          task.id === id ? { ...task, completed: !completed } : task
        )
      );
      setError(null); // Clear previous errors

    try {
      console.log(`[TaskList-${listType}] Calling updateTodo for task ${id}, setting completed to ${!completed}`);
      await updateTodo(id, { completed: !completed });
      console.log(`[TaskList-${listType}] updateTodo successful for task ${id}.`);
       toast({ // Success toast
         title: "Task Updated",
         description: `Task status changed.`,
       });
    } catch (err: any) {
        console.error(`[TaskList-${listType}] Error updating task ${id}:`, err);
        const errorMessage = err.message || `Failed to update task status. Please try again.`;
        setError(errorMessage);
         // Revert optimistic update on failure
        setTasks(originalTasks);
        toast({ // Error toast
            variant: "destructive",
            title: "Error updating task",
            description: errorMessage,
        });
    }
  };

  const handleDeleteTask = async (id: string, text: string) => {
      const originalTasks = [...tasks];
      // Optimistically update UI
      setTasks((prevTasks) => prevTasks.filter((task) => task.id !== id));
      setError(null); // Clear previous errors

    try {
      console.log(`[TaskList-${listType}] Calling deleteTodo for task ${id} ("${text}")`);
      await deleteTodo(id);
      console.log(`[TaskList-${listType}] deleteTodo successful for task ${id}.`);
       toast({ // Success toast
         title: "Task Deleted",
         description: `"${text}" was deleted.`,
       });
    } catch (err: any) {
      console.error(`[TaskList-${listType}] Error deleting task ${id}:`, err);
      const errorMessage = err.message || `Failed to delete task. Please try again.`;
      setError(errorMessage);
      // Revert optimistic update on failure
      setTasks(originalTasks);
      toast({ // Error toast
          variant: "destructive",
          title: "Error deleting task",
          description: errorMessage,
      });
    }
  };

  // Filter tasks based on completion status (sorting is now done by Firestore)
  const incompleteTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);

  // Format date for display, handle case where currentDate might not be set yet
   const displayDate = listType === 'daily'
    ? (currentDate ? format(new Date(currentDate + 'T00:00:00'), 'MMMM d, yyyy') : 'Loading date...')
    : '';


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
           // Disable if it's daily tasks and date isn't ready OR if an error occurred
          disabled={(listType === 'daily' && !currentDate) || !!error}
        />
        <Button
           type="submit"
           // Disable if no text, loading, daily tasks and date isn't ready, OR error occurred
           disabled={!newTask.trim() || loading || (listType === 'daily' && !currentDate) || !!error}
           aria-label={`Add ${listType} task`}
           // Add loading state to the button
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
              </p>
            )}

            {/* Render tasks only if there are tasks and no critical fetch error prevented loading */}
            {!error && incompleteTasks.length > 0 && (
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

            {!error && completedTasks.length > 0 && incompleteTasks.length > 0 && (
              <Separator className="my-4" />
            )}

            {!error && completedTasks.length > 0 && (
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
  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-muted/30">
       <Skeleton className="h-5 w-5 rounded-sm flex-shrink-0" />
       <Skeleton className="h-4 flex-grow rounded max-w-[70%]" />
       <Skeleton className="h-8 w-8 rounded flex-shrink-0" />
    </div>
  );
}

