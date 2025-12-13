"use client";
import { useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeEffect() {
    const { theme } = useTheme();

    useEffect(() => {
        const html = document.documentElement;
        if (theme === 'dark') {
            html.classList.add('dark');
        } else {
            html.classList.remove('dark');
        }
    }, [theme]);

    return null;
}
