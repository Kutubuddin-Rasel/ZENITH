'use client';

import React from 'react';
import PageLayout from '@/components/PageLayout';
import { IntegrationHub } from '@/components/IntegrationHub/IntegrationHub';

const IntegrationsPage: React.FC = () => {
  return (
    <PageLayout
      title="Integrations"
      subtitle="Connect your favorite tools and streamline your workflow"
    >
      <IntegrationHub />
    </PageLayout>
  );
};

export default IntegrationsPage;
