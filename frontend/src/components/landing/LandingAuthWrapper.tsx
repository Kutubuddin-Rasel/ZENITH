"use client";

import { useAuth } from "../../context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LandingAuthWrapper() {
    const { user, token, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && token && user) {
            router.replace("/projects");
        }
    }, [loading, token, user, router]);

    // Loading state can be handled here or just return null to not block the static UI
    if (loading || (token && !user)) {
        // Optionally return a spinner, or better yet, return null so the static content shows immediately
        // If we return a spinner here, it overlays the static content which defeats the purpose of RSC for SEO if it blocks.
        // However, if we want to prevent a flash of landing page for logged-in users, we might want a spinner.
        // Given the requirement is SEO, we prefer showing content. But for UX, we don't want them to see landing page if they are logged in.
        // Compromise: Return null, and let the redirect happen. The static page is visible for a split second.
        // OR: We can use a full screen loader if we really want to block.
        // The previous implementation returned a full screen loader.
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-neutral-950">
                <span className="animate-spin h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full inline-block" />
            </div>
        );
    }

    // If redirecting, return null (handled by useEffect)
    if (token && user) return null;

    // If not logged in, render nothing (children will be rendered by the parent Server Component)
    return null;
}
