import type { Metadata } from 'next';
import { TaskList } from '@/components/task-list';

export const metadata: Metadata = {
  title: 'TaskMaster - Manage Your Tasks',
  description: 'A simple and effective todo list app to manage your daily and global tasks.',
};

export default function Home() {
  return (
    <main className="min-h-screen p-4 sm:p-8 md:p-12 lg:p-16 bg-background">
      <h1 className="text-3xl font-bold text-center text-primary mb-8">TaskMaster</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Daily Tasks Section */}
        <div className="bg-card p-6 rounded-lg shadow-md border border-border">
          <TaskList listType="daily" />
        </div>

        {/* Global Tasks Section */}
        <div className="bg-card p-6 rounded-lg shadow-md border border-border">
          <TaskList listType="global" />
        </div>
      </div>
    </main>
  );
}
