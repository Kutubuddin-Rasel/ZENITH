
'use client';

import { useState } from 'react';

export function BrowserSelect({ onSelect }: { onSelect: (browser: string) => void }) {
    const [selected, setSelected] = useState<string>('');

    const browsers = ['Chrome', 'Firefox', 'Safari', 'Edge'];

    const handleSelect = (browser: string) => {
        setSelected(browser);
        onSelect(browser);
    };

    return (
        <div className="p-4 border rounded-lg bg-card text-card-foreground shadow-sm max-w-sm">
            <h3 className="text-lg font-semibold mb-2">Which browser are you using?</h3>
            <div className="grid grid-cols-2 gap-2">
                {browsers.map((browser) => (
                    <button
                        key={browser}
                        onClick={() => handleSelect(browser)}
                        className={`px-4 py-2 rounded-md transition-colors ${selected === browser
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                            }`}
                    >
                        {browser}
                    </button>
                ))}
            </div>
        </div>
    );
}
