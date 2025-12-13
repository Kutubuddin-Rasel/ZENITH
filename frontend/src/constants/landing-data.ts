import {
    Squares2X2Icon,
    BoltIcon,
    UsersIcon,
    ClockIcon,
    ChatBubbleBottomCenterTextIcon,
    ShieldCheckIcon,
    CheckCircleIcon,
    RocketLaunchIcon,
    CodeBracketIcon,
    ChartBarIcon,
} from "@heroicons/react/24/outline";

// ============================================================================
// Hero Section Data
// ============================================================================

export const FEATURE_CARDS = [
    {
        id: 'kanban',
        title: 'Kanban Boards That Scale',
        description: 'Visualize your workflow with customizable boards. Drag and drop issues across statuses, assign team members, and watch progress happen in real-time.',
        icon: Squares2X2Icon,
        tags: ['Drag & Drop', 'Custom Columns', 'Live Updates'],
        className: 'lg:col-span-2 lg:row-span-2',
        gradient: 'from-primary-500 to-primary-700',
        isLarge: true,
    },
    {
        id: 'sprint',
        title: 'Sprint Planning',
        description: 'Plan 2-week sprints with velocity tracking and burndown charts.',
        icon: BoltIcon,
        gradient: 'from-success-500 to-success-600',
        isLarge: false,
    },
    {
        id: 'team',
        title: 'Team Sync',
        description: 'Real-time collaboration with mentions, comments, and notifications.',
        icon: UsersIcon,
        gradient: 'from-warning-500 to-warning-600',
        isLarge: false,
    },
    {
        id: 'time',
        title: 'Work Logs',
        description: 'Track time spent on issues with detailed work logs and reports.',
        icon: ClockIcon,
        gradient: 'from-primary-600 to-primary-700',
        isLarge: false,
        bgVariant: 'neutral',
    },
    {
        id: 'activity',
        title: 'Rich Activity Feed',
        description: 'Never miss an update. Track every comment, status change, and assignment in a beautiful timeline view.',
        icon: ChatBubbleBottomCenterTextIcon,
        tags: ['@mentions', 'Reactions'],
        className: 'lg:col-span-2',
        gradient: 'from-primary-500 to-primary-600',
        isLarge: false,
        bgVariant: 'gradient-subtle',
    },
] as const;

export const TRUST_BADGES = [
    { icon: ShieldCheckIcon, text: 'SOC 2 Certified', color: 'text-success-600' },
    { icon: CheckCircleIcon, text: 'GDPR Compliant', color: 'text-success-600' },
    { icon: UsersIcon, text: '10,000+ Active Teams', color: 'text-primary-600' },
] as const;

// ============================================================================
// Features Section Data
// ============================================================================

export const FEATURES = [
    {
        id: 'fast',
        title: 'Lightning Fast',
        description: 'Optimized for performance with instant search and smooth interactions',
        icon: RocketLaunchIcon,
        gradient: 'from-primary-500 to-primary-600',
        rotation: 'rotate-3 hover:rotate-6',
    },
    {
        id: 'developer',
        title: 'Developer First',
        description: 'Built by engineers, for engineers with powerful APIs and integrations',
        icon: CodeBracketIcon,
        gradient: 'from-success-500 to-success-600',
        rotation: '-rotate-3 hover:-rotate-6',
    },
    {
        id: 'data',
        title: 'Data Driven',
        description: 'Real-time insights and analytics to help your team improve every sprint',
        icon: ChartBarIcon,
        gradient: 'from-warning-500 to-warning-600',
        rotation: 'rotate-3 hover:rotate-6',
    },
] as const;

// ============================================================================
// Testimonials Section Data
// ============================================================================

export const TESTIMONIALS = [
    {
        id: 'sarah',
        name: 'Sarah Chen',
        role: 'Engineering Manager',
        company: 'TechCorp',
        quote: 'Zenith transformed our workflow. Sprint planning has never been this smooth. We shipped 40% more features this quarter.',
    },
    {
        id: 'michael',
        name: 'Michael Park',
        role: 'Product Lead',
        company: 'StartupXYZ',
        quote: "Best PM tool we've used. Clean, fast, and incredibly powerful. Our team adopted it in 2 days without training.",
    },
    {
        id: 'alex',
        name: 'Alex Rivera',
        role: 'Scrum Master',
        company: 'DevTeam Inc',
        quote: 'Our velocity doubled since switching. The burndown charts and insights helped us identify bottlenecks instantly.',
    },
] as const;

// ============================================================================
// Pricing Section Data
// ============================================================================

export const PRICING_PLANS = [
    {
        id: 'free',
        name: 'Free',
        price: '$0',
        period: '/month',
        description: 'Perfect for small teams',
        features: [
            'Up to 5 users',
            'Unlimited projects',
            'Basic support'
        ],
        cta: 'Create Workspace',
        href: '/auth/register',
        popular: false,
    },
    {
        id: 'pro',
        name: 'Pro',
        price: '$12',
        period: '/user/month',
        description: 'For growing teams',
        features: [
            'Unlimited users',
            'Advanced analytics',
            'Priority support',
            'Custom integrations'
        ],
        cta: 'Create Workspace',
        href: '/auth/register',
        popular: true,
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 'Custom',
        period: '',
        description: 'For large organizations',
        features: [
            'Everything in Pro',
            'SAML/SSO',
            'Dedicated support',
            'SLA guarantee'
        ],
        cta: 'Contact Sales',
        href: '/contact',
        popular: false,
    },
] as const;
