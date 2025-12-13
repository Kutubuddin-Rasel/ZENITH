import Link from "next/link";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { PRICING_PLANS } from "../../constants/landing-data";

export default function Pricing() {
    return (
        <div id="pricing" className="relative py-24 bg-neutral-50/50 dark:bg-neutral-900/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-neutral-900 to-neutral-700 dark:from-white dark:to-neutral-300 bg-clip-text text-transparent mb-4">
                        Simple, transparent pricing
                    </h2>
                    <p className="text-lg text-neutral-600 dark:text-neutral-400">
                        Start free, upgrade when you&apos;re ready
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {PRICING_PLANS.map((plan) => (
                        <div
                            key={plan.id}
                            className={`p-8 rounded-2xl border-2 transition-all ${plan.popular
                                    ? 'bg-gradient-to-br from-primary-600 to-primary-700 border-primary-500 relative overflow-hidden scale-105 shadow-xl'
                                    : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 hover:border-primary-400 dark:hover:border-primary-600'
                                }`}
                        >
                            {plan.popular && (
                                <div className="absolute top-4 right-4 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-white text-xs font-bold">
                                    POPULAR
                                </div>
                            )}

                            <h3 className={`text-2xl font-bold mb-2 ${plan.popular ? 'text-white' : 'text-neutral-900 dark:text-white'}`}>
                                {plan.name}
                            </h3>
                            <p className={`mb-6 ${plan.popular ? 'text-primary-100' : 'text-neutral-600 dark:text-neutral-400'}`}>
                                {plan.description}
                            </p>

                            <div className="mb-6">
                                <span className={`text-4xl font-bold ${plan.popular ? 'text-white' : 'text-neutral-900 dark:text-white'}`}>
                                    {plan.price}
                                </span>
                                {plan.period && (
                                    <span className={plan.popular ? 'text-primary-100' : 'text-neutral-600 dark:text-neutral-400'}>
                                        {plan.period}
                                    </span>
                                )}
                            </div>

                            <ul className="space-y-3 mb-8 text-sm">
                                {plan.features.map((feature, i) => (
                                    <li key={i} className="flex items-center gap-2">
                                        <CheckCircleIcon className={`h-5 w-5 flex-shrink-0 ${plan.popular ? 'text-white' : 'text-success-600'}`} />
                                        <span className={plan.popular ? 'text-white' : 'text-neutral-700 dark:text-neutral-300'}>
                                            {feature}
                                        </span>
                                    </li>
                                ))}
                            </ul>

                            <Link
                                href={plan.href}
                                className={`block w-full text-center py-3 rounded-lg font-semibold transition-colors ${plan.popular
                                        ? 'bg-white text-primary-600 hover:bg-primary-50'
                                        : 'border-2 border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800'
                                    }`}
                            >
                                {plan.cta}
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
