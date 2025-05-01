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

interface TaskListProps {
  listType: 'daily' | 'global';
}

export function TaskList({ listType }: TaskListProps) {
  const [tasks, setTasks] = useState<Todo[]>([]);
  const [newTask, setNewTask] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState<string>('');

  useEffect(() => {
    // Ensure date generation happens only on the client
    setCurrentDate(format(new Date(), 'yyyy-MM-dd'));
  }, []);


  const fetchTasks = useCallback(async () => {
    if (!currentDate && listType === 'daily') return; // Don't fetch daily tasks if date isn't set yet

    setLoading(true);
    setError(null);
    try {
      const fetchedTasks = await getTodos(listType, listType === 'daily' ? currentDate : undefined);
      setTasks(fetchedTasks);
    } catch (err) {
      console.error("Error fetching tasks:", err);
      setError(`Failed to load ${listType} tasks. Please try again later.`);
    } finally {
      setLoading(false);
    }
  }, [listType, currentDate]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleAddTask = async (e: FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;
     if (!currentDate && listType === 'daily') {
        setError("Cannot add daily task: Date not initialized.");
        return;
     }


    const taskToAdd: Omit<Todo, 'id'> = {
      text: newTask.trim(),
      completed: false,
      createdAt: new Date(),
      date: listType === 'daily' ? currentDate : null,
      type: listType,
    };

    setNewTask(''); // Optimistically clear input

    try {
      const addedTodo = await addTodo(taskToAdd);
      setTasks((prevTasks) => [...prevTasks, addedTodo]); // Update state with the returned ID
      setError(null);
    } catch (err) {
        console.error("Error adding task:", err);
        setError(`Failed to add task. Please try again.`);
        // Revert optimistic update if needed, e.g., bring back the input text
        setNewTask(taskToAdd.text);
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

    try {
      await updateTodo(id, { completed: !completed });
      setError(null); // Clear error on success
    } catch (err) {
        console.error("Error updating task:", err);
        setError(`Failed to update task status. Please try again.`);
         // Revert optimistic update on failure
        setTasks(originalTasks);
    }
  };

  const handleDeleteTask = async (id: string) => {
      const originalTasks = [...tasks];
      // Optimistically update UI
      setTasks((prevTasks) => prevTasks.filter((task) => task.id !== id));

    try {
      await deleteTodo(id);
       setError(null); // Clear error on success
    } catch (err) {
      console.error("Error deleting task:", err);
      setError(`Failed to delete task. Please try again.`);
      // Revert optimistic update on failure
      setTasks(originalTasks);
    }
  };

  const incompleteTasks = tasks.filter((task) => !task.completed).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const completedTasks = tasks.filter((task) => task.completed).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return (
    <div className="flex flex-col h-full">
      <h2 className="text-2xl font-semibold mb-4 text-secondary-foreground">
        {listType === 'daily' ? `Today's Tasks (${currentDate ? format(new Date(currentDate + 'T00:00:00'), 'MMMM d, yyyy') : 'Loading...'})` : 'Global Tasks'}
      </h2>

       {error && (
         <div className="bg-destructive/10 text-destructive p-3 rounded-md mb-4 text-sm">
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
          <Plus className="h-4 w-4 mr-2" />
          Add
        </Button>
      </form>

      <div className="flex-grow overflow-y-auto space-y-4 pr-2">
        {loading ? (
           <>
             <TaskItemSkeleton />
             <TaskItemSkeleton />
             <TaskItemSkeleton />
           </>
         ) : (
          <>
            {incompleteTasks.length === 0 && completedTasks.length === 0 && (
              <p className="text-muted-foreground text-center mt-8">No tasks yet. Add one above!</p>
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
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Completed</h3>
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
  onDelete: (id: string) => void;
}

function TaskItem({ task, onToggleComplete, onDelete }: TaskItemProps) {
  return (
    <div className={cn(
        "flex items-center gap-3 p-3 rounded-md transition-colors duration-200 ease-in-out",
        task.completed ? 'bg-muted/50 hover:bg-muted/70' : 'hover:bg-secondary/50'
      )}
     >
      <Checkbox
        id={`task-${task.id}`}
        checked={task.completed}
        onCheckedChange={() => onToggleComplete(task.id, task.completed)}
        aria-label={task.completed ? 'Mark task as incomplete' : 'Mark task as complete'}
        className="transition-transform duration-200 ease-in-out data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-foreground"
      />
      <label
        htmlFor={`task-${task.id}`}
        className={cn(
          "flex-grow cursor-pointer text-sm",
          task.completed && "line-through text-muted-foreground"
        )}
      >
        {task.text}
      </label>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onDelete(task.id)}
        className="text-muted-foreground hover:text-destructive h-8 w-8 transition-colors duration-200 ease-in-out"
        aria-label={`Delete task: ${task.text}`}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}


function TaskItemSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-md">
       <Skeleton className="h-5 w-5 rounded-sm" />
       <Skeleton className="h-4 flex-grow rounded" />
       <Skeleton className="h-8 w-8 rounded" />
    </div>
  );
}
