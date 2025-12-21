'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  MagnifyingGlassIcon, 
  XMarkIcon, 
  DocumentTextIcon,
  ChatBubbleLeftRightIcon,
  CodeBracketIcon,
  CalendarIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import Modal from '../Modal';
import Input from '../Input';

export interface SearchResult {
  id: string;
  title: string;
  content: string;
  source: string;
  contentType: string;
  url: string;
  author: string;
  timestamp: Date;
  relevanceScore: number;
  metadata: Record<string, unknown>;
}

export interface SearchSuggestion {
  text: string;
  type: 'query' | 'source' | 'content_type';
  count?: number;
}

export interface UnifiedSearchResults {
  results: SearchResult[];
  total: number;
  sources: string[];
  suggestions: string[];
  query: string;
  took: number;
}

interface UniversalSearchProps {
  onClose: () => void;
}

export const UniversalSearch: React.FC<UniversalSearchProps> = ({ onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedContentType, setSelectedContentType] = useState<string>('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [total, setTotal] = useState(0);
  const [took, setTook] = useState(0);

  const search = useCallback(async (searchQuery: string) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      setTotal(0);
      return;
    }

    try {
      setLoading(true);
      const token = localStorage.getItem('access_token');
      
      const params = new URLSearchParams({
        q: searchQuery,
        limit: '20',
        offset: '0',
      });

      if (selectedSources.length > 0) {
        params.append('sources', selectedSources.join(','));
      }

      if (selectedContentType) {
        params.append('contentType', selectedContentType);
      }

      const response = await fetch(`http://localhost:3000/api/integrations/search/universal?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data: UnifiedSearchResults = await response.json();
        setResults(data.results);
        setTotal(data.total);
        setTook(data.took);
        setSuggestions(data.suggestions.map(s => ({ text: s, type: 'query' as const })));
      } else {
        console.error('Search failed');
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedSources, selectedContentType]);

  const getSuggestions = useCallback(async (partialQuery: string) => {
    if (partialQuery.length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const token = localStorage.getItem('access_token');
      
      const response = await fetch(`http://localhost:3000/api/integrations/search/suggestions?q=${encodeURIComponent(partialQuery)}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data: SearchSuggestion[] = await response.json();
        setSuggestions(data);
      }
    } catch (error) {
      console.error('Suggestions error:', error);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query) {
        search(query);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, search]);

  useEffect(() => {
    if (query.length >= 2) {
      getSuggestions(query);
    }
  }, [query, getSuggestions]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setShowSuggestions(value.length >= 2);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    setShowSuggestions(false);
    search(suggestion);
  };

  const handleSourceToggle = (source: string) => {
    setSelectedSources(prev => 
      prev.includes(source) 
        ? prev.filter(s => s !== source)
        : [...prev, source]
    );
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'slack':
        return <ChatBubbleLeftRightIcon className="h-4 w-4" />;
      case 'github':
        return <CodeBracketIcon className="h-4 w-4" />;
      case 'jira':
        return <DocumentTextIcon className="h-4 w-4" />;
      case 'google_workspace':
        return <CalendarIcon className="h-4 w-4" />;
      case 'microsoft_teams':
        return <UserIcon className="h-4 w-4" />;
      case 'trello':
        return <DocumentTextIcon className="h-4 w-4" />;
      default:
        return <DocumentTextIcon className="h-4 w-4" />;
    }
  };

  const getContentTypeIcon = (contentType: string) => {
    switch (contentType) {
      case 'message':
        return <ChatBubbleLeftRightIcon className="h-4 w-4" />;
      case 'issue':
        return <DocumentTextIcon className="h-4 w-4" />;
      case 'commit':
        return <CodeBracketIcon className="h-4 w-4" />;
      case 'pull_request':
        return <CodeBracketIcon className="h-4 w-4" />;
      case 'event':
        return <CalendarIcon className="h-4 w-4" />;
      default:
        return <DocumentTextIcon className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const availableSources = ['slack', 'github', 'jira', 'google_workspace', 'microsoft_teams', 'trello'];
  const availableContentTypes = ['message', 'issue', 'commit', 'pull_request', 'event', 'document'];

  return (
    <Modal open={true} onClose={onClose} maxWidthClass="sm:max-w-6xl">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-900">Universal Search</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Search Input */}
        <div className="relative mb-6">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <Input
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search across all your connected tools..."
              className="pl-10 pr-4 py-3 text-lg"
              autoFocus
            />
            {loading && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>

          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-neutral-300 rounded-md shadow-lg max-h-60 overflow-auto">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestionClick(suggestion.text)}
                  className="w-full px-4 py-2 text-left hover:bg-neutral-50 flex items-center space-x-2"
                >
                  <MagnifyingGlassIcon className="h-4 w-4 text-neutral-400" />
                  <span className="text-sm text-neutral-700">{suggestion.text}</span>
                  {suggestion.count && (
                    <span className="text-xs text-neutral-500">({suggestion.count})</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          {/* Source Filters */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Sources</label>
            <div className="flex flex-wrap gap-2">
              {availableSources.map((source) => (
                <button
                  key={source}
                  onClick={() => handleSourceToggle(source)}
                  className={`flex items-center space-x-1 px-3 py-1 rounded-full text-sm ${
                    selectedSources.includes(source)
                      ? 'bg-blue-100 text-blue-800 border border-blue-200'
                      : 'bg-neutral-100 text-neutral-700 border border-neutral-200 hover:bg-neutral-200'
                  }`}
                >
                  {getSourceIcon(source)}
                  <span className="capitalize">{source.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Content Type Filter */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">Content Type</label>
            <select
              value={selectedContentType}
              onChange={(e) => setSelectedContentType(e.target.value)}
              className="block w-full px-3 py-2 border border-neutral-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">All Types</option>
              {availableContentTypes.map((type) => (
                <option key={type} value={type}>
                  {type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {query && (
            <div className="flex items-center justify-between text-sm text-neutral-500 mb-4">
              <span>
                {total > 0 ? `${total} results` : 'No results'} 
                {took > 0 && ` (${took}ms)`}
              </span>
              {selectedSources.length > 0 && (
                <span>Filtered by: {selectedSources.join(', ')}</span>
              )}
            </div>
          )}

          {results.length === 0 && query && !loading && (
            <div className="text-center py-8">
              <MagnifyingGlassIcon className="h-12 w-12 text-neutral-400 mx-auto mb-4" />
              <p className="text-neutral-500">No results found for &quot;{query}&quot;</p>
              <p className="text-sm text-neutral-400 mt-1">
                Try adjusting your search terms or filters
              </p>
            </div>
          )}

          {results.map((result) => (
            <div
              key={result.id}
              className="border border-neutral-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => window.open(result.url, '_blank')}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  {getContentTypeIcon(result.contentType)}
                  <span className="text-sm font-medium text-neutral-900">{result.title}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-neutral-500">{formatTimestamp(result.timestamp)}</span>
                  <span className="text-xs bg-neutral-100 text-neutral-600 px-2 py-1 rounded">
                    {result.source}
                  </span>
                </div>
              </div>
              
              <p className="text-sm text-neutral-600 mb-2 line-clamp-2">
                {result.content}
              </p>
              
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 text-xs text-neutral-500">
                  <span>by {result.author}</span>
                  <span>•</span>
                  <span>{result.contentType}</span>
                  <span>•</span>
                  <span>{Math.round(result.relevanceScore)}% match</span>
                </div>
                <span className="text-xs text-blue-600 hover:text-blue-800">
                  View →
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};
