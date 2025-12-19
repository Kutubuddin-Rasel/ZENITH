"use client";
import { redirect } from 'next/navigation';

// Settings index page - redirect to preferences by default
export default function SettingsPage() {
    redirect('/settings/preferences');
}
