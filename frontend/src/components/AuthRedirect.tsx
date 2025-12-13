"use client";

import { useAuth } from "../context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AuthRedirect() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        // Token is now HttpOnly cookie
        if (!loading && user) {
            router.replace("/projects");
        }
    }, [loading, user, router]);

    // If we have a user but it's not fully loaded? No, user is enough.
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-neutral-50 dark:bg-neutral-950 fixed inset-0 z-50">
                <div className="flex flex-col items-center gap-3">
                    <span className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full inline-block" />
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">Loading...</span>
                </div>
            </div>
        );
    }

    // If authenticated, return null (we are redirecting)
    // If not authenticated, return null (we render the landing page)
    return null;
}
