
'use client';

import { useState } from 'react';

export function LogUploader({ onUpload }: { onUpload: (content: string) => void }) {
    const [uploading, setUploading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        // Simulating upload/read
        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            onUpload(content); // Pass content back to AI
            setUploading(false);
        };
        reader.readAsText(file);
    };

    return (
        <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Upload Error Log</h3>
            <div className="space-y-2">
                <input
                    type="file"
                    accept=".log,.txt"
                    onChange={handleFileChange}
                    disabled={uploading}
                    className="block w-full text-sm text-muted-foreground
            file:mr-4 file:py-2 file:px-4
            file:rounded-full file:border-0
            file:text-sm file:font-semibold
            file:bg-primary file:text-primary-foreground
            hover:file:bg-primary/90"
                />
                {uploading && <p className="text-sm text-blue-500">Reading file...</p>}
            </div>
        </div>
    );
}
