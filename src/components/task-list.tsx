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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<string>('');
  const { toast } = useToast(); // Initialize toast

  useEffect(() => {
    // Set current date on client-side mount
    setCurrentDate(format(new Date(), 'yyyy-MM-dd'));
  }, []);


  // Fetch tasks whenever listType or currentDate (if relevant) changes
  useEffect(() => {
    // Prevent fetching daily tasks until currentDate is set
    if (listType === 'daily' && !currentDate) {
        setLoading(false); // Stop loading indicator if date isn't ready
        return;
    }

    const fetchTasks = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedTasks = await getTodos(listType, listType === 'daily' ? currentDate : undefined);
        setTasks(fetchedTasks);
      } catch (err: any) {
        console.error(`Error fetching ${listType} tasks:`, err);
        const errorMessage = err.message || `Failed to load ${listType} tasks. Please try again later.`;
        setError(errorMessage);
        toast({ // Show error toast
            variant: "destructive",
            title: `Error loading ${listType} tasks`,
            description: errorMessage,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
    // Dependency array ensures fetch runs when type or date changes
  }, [listType, currentDate, toast]);

  const handleAddTask = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTask = newTask.trim();
    if (!trimmedTask) return;
    if (listType === 'daily' && !currentDate) {
        const msg = "Cannot add daily task: Date not initialized.";
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
      // Call backend to add task
      const addedTodo = await addTodo(taskToAdd);
      // Replace optimistic task with the real one from backend
      setTasks((prevTasks) =>
        prevTasks.map((task) => (task.id === optimisticId ? addedTodo : task))
      );
       toast({ // Success toast
         title: "Task Added",
         description: `"${addedTodo.text}" was added successfully.`,
       });
    } catch (err: any) {
        console.error("Error adding task:", err);
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
      await updateTodo(id, { completed: !completed });
       toast({ // Success toast
         title: "Task Updated",
         description: `Task status changed.`,
       });
    } catch (err: any) {
        console.error("Error updating task:", err);
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
      await deleteTodo(id);
       toast({ // Success toast
         title: "Task Deleted",
         description: `"${text}" was deleted.`,
       });
    } catch (err: any) {
      console.error("Error deleting task:", err);
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
   const displayDate = currentDate ? format(new Date(currentDate + 'T00:00:00'), 'MMMM d, yyyy') : 'Loading...';


  return (
    <div className="flex flex-col h-full">
      <h2 className="text-2xl font-semibold mb-4 text-secondary-foreground">
        {listType === 'daily' ? `Today's Tasks (${displayDate})` : 'Global Tasks'}
      </h2>

       {error && !loading && ( // Only show error if not loading
         <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4 text-sm border border-destructive/30">
             {error}
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
          disabled={loading || (listType === 'daily' && !currentDate)}
        />
        <Button type="submit" disabled={!newTask.trim() || loading || (listType === 'daily' && !currentDate)} aria-label={`Add ${listType} task`}>
          <Plus className="h-4 w-4 mr-1" />
          Add
        </Button>
      </form>

      <div className="flex-grow overflow-y-auto space-y-2 pr-1 scroll-smooth">
        {loading ? (
           <div className="space-y-3">
             <TaskItemSkeleton />
             <TaskItemSkeleton />
             <TaskItemSkeleton />
           </div>
         ) : (
          <>
            {tasks.length === 0 && (
              <p className="text-muted-foreground text-center mt-8">
                No {listType} tasks yet. Add one above!
              </p>
            )}

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
