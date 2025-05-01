
import type { Metadata } from 'next';
import { TaskList } from '@/components/task-list';
import { useEffect } from 'react'; // Import useEffect for client-side logging

export const metadata: Metadata = {
  title: 'TaskMaster - Manage Your Tasks',
  description: 'A simple and effective todo list app to manage your daily and global tasks.',
};

export default function Home() {
  // Add a console log to confirm the page component renders
  // Since this is a Server Component by default, this log will appear in the server console (e.g., Vercel logs)
  console.log("[Home Page] Rendering Home component (server-side).");

  // If you need client-side logging (e.g., to check if hydration completes),
  // you would typically move the parts needing client interaction into a client component.
  // However, for just logging mount, you *could* add a simple client component wrapper or use useEffect here,
  // but be mindful that making the whole page a client component (`"use client";` at top) has performance implications.

  // For now, let's stick to the server log.

  return (
    <main className="min-h-screen p-4 sm:p-8 md:p-12 lg:p-16 bg-background">
      <h1 className="text-3xl font-bold text-center text-primary mb-8">TaskMaster</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Daily Tasks Section */}
        <div className="bg-card p-6 rounded-lg shadow-md border border-border">
           {/* --- Debug Log: Rendering Daily TaskList --- */}
           {console.log("[Home Page] Rendering Daily TaskList component.")}
          <TaskList listType="daily" />
        </div>

        {/* Global Tasks Section */}
        <div className="bg-card p-6 rounded-lg shadow-md border border-border">
           {/* --- Debug Log: Rendering Global TaskList --- */}
           {console.log("[Home Page] Rendering Global TaskList component.")}
          <TaskList listType="global" />
        </div>
      </div>
    </main>
  );
}
