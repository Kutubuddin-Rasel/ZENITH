"use client";
import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  useVelocityReport, 
  useBurndownReport, 
  useCumulativeFlowReport, 
  useEpicProgressReport, 
  useIssueBreakdownReport 
} from '@/hooks/useReports';
import Card from '@/components/Card';
import Spinner from '@/components/Spinner';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import ProtectedProjectRoute from '@/components/ProtectedProjectRoute';
import { 
  ChartBarIcon, 
  ArrowTrendingDownIcon, 
  ArrowTrendingUpIcon, 
  BookOpenIcon, 
  ChartPieIcon 
} from '@heroicons/react/24/outline';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function ReportsPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [activeTab, setActiveTab] = useState('velocity');

  // Fetch all report data
  const { data: velocityData, isLoading: velocityLoading, isError: velocityError } = useVelocityReport(projectId);
  const { data: burndownData, isLoading: burndownLoading, isError: burndownError } = useBurndownReport(projectId);
  const { data: cumulativeFlowData, isLoading: cumulativeFlowLoading, isError: cumulativeFlowError } = useCumulativeFlowReport(projectId);
  const { data: epicProgressData, isLoading: epicProgressLoading, isError: epicProgressError } = useEpicProgressReport(projectId);
  const { data: issueBreakdownData, isLoading: issueBreakdownLoading, isError: issueBreakdownError } = useIssueBreakdownReport(projectId);

  const tabs = [
    { id: 'velocity', name: 'Velocity Chart', icon: ChartBarIcon },
    { id: 'burndown', name: 'Burndown Chart', icon: ArrowTrendingDownIcon },
    { id: 'cumulative-flow', name: 'Cumulative Flow', icon: ArrowTrendingUpIcon },
    { id: 'epic-progress', name: 'Epic Progress', icon: BookOpenIcon },
    { id: 'issue-breakdown', name: 'Issue Breakdown', icon: ChartPieIcon },
  ];

  const renderVelocityChart = () => {
    if (velocityLoading) return <Spinner />;
    if (velocityError) return <div className="text-red-500">Error loading velocity data</div>;
    if (!velocityData || velocityData.length === 0) {
      return <div className="text-center text-gray-500">No completed sprints found</div>;
    }

    const averageVelocity = velocityData.reduce((acc, sprint) => acc + sprint.completedPoints, 0) / velocityData.length;

    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">Average Velocity</h3>
          <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{averageVelocity.toFixed(1)} points per sprint</p>
        </div>
        
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={velocityData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="sprintName" />
            <YAxis label={{ value: 'Story Points', angle: -90, position: 'insideLeft' }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="committedPoints" fill="#8884d8" name="Committed Points" />
            <Bar dataKey="completedPoints" fill="#3b82f6" name="Completed Points" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderBurndownChart = () => {
    if (burndownLoading) return <Spinner />;
    if (burndownError) return <div className="text-red-500">Error loading burndown data</div>;
    if (!burndownData || burndownData.length === 0) {
      return <div className="text-center text-gray-500">No active sprints found</div>;
    }

    const sprint = burndownData[0];

  return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 p-4 rounded-xl">
            <h4 className="text-sm font-medium text-green-700 dark:text-green-300">Total Points</h4>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{sprint.totalPoints}</p>
          </div>
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 p-4 rounded-xl">
            <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">Completed</h4>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{sprint.completedPoints}</p>
          </div>
          <div className="bg-gradient-to-r from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 p-4 rounded-xl">
            <h4 className="text-sm font-medium text-orange-700 dark:text-orange-300">Remaining</h4>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{sprint.remainingPoints}</p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl">
          <h4 className="text-lg font-semibold mb-4">Sprint Progress</h4>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">
            <div 
              className="bg-gradient-to-r from-green-400 to-emerald-500 h-4 rounded-full transition-all duration-1000"
              style={{ width: `${sprint.completionPercentage}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {sprint.completionPercentage.toFixed(1)}% complete
          </p>
        </div>
      </div>
    );
  };

  const renderCumulativeFlowChart = () => {
    if (cumulativeFlowLoading) return <Spinner />;
    if (cumulativeFlowError) return <div className="text-red-500">Error loading cumulative flow data</div>;
    if (!cumulativeFlowData || cumulativeFlowData.length === 0) {
      return <div className="text-center text-gray-500">No data available for the selected period</div>;
    }

    const statuses = Object.keys(cumulativeFlowData[0]).filter(key => key !== 'date');

    return (
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={cumulativeFlowData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          {statuses.map((status, index) => (
            <Area 
              key={status}
              type="monotone" 
              dataKey={status} 
              stackId="1" 
              stroke={COLORS[index % COLORS.length]} 
              fill={COLORS[index % COLORS.length]} 
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    );
  };

  const renderEpicProgress = () => {
    if (epicProgressLoading) return <Spinner />;
    if (epicProgressError) return <div className="text-red-500">Error loading epic progress data</div>;
    if (!epicProgressData || epicProgressData.length === 0) {
      return <div className="text-center text-gray-500">No epics found</div>;
    }

    return (
      <div className="space-y-6">
        {epicProgressData.map((epic) => (
          <Card key={epic.epicId} className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{epic.epicTitle}</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                epic.epicStatus === 'Done' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                epic.epicStatus === 'In Progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
              }`}>
                {epic.epicStatus}
              </span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{epic.totalStories}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Stories</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{epic.completedStories}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Completed</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{epic.totalStoryPoints}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Points</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{epic.completedStoryPoints}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">Completed Points</p>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Stories Progress</span>
                  <span>{epic.completionPercentage.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${epic.completionPercentage}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Story Points Progress</span>
                  <span>{epic.storyPointsCompletionPercentage.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${epic.storyPointsCompletionPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  const renderIssueBreakdown = () => {
    if (issueBreakdownLoading) return <Spinner />;
    if (issueBreakdownError) return <div className="text-red-500">Error loading issue breakdown data</div>;
    if (!issueBreakdownData) {
      return <div className="text-center text-gray-500">No issues found</div>;
    }

    const createPieChartData = (breakdown: { [key: string]: number }) => {
      return Object.entries(breakdown).map(([key, value]) => ({ name: key, value }));
    };

    return (
      <div className="space-y-8">
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 p-6 rounded-xl">
          <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100 mb-2">Total Issues</h3>
          <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{issueBreakdownData.totalIssues}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card className="p-6">
            <h4 className="text-lg font-semibold mb-4">By Type</h4>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={createPieChartData(issueBreakdownData.typeBreakdown)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {createPieChartData(issueBreakdownData.typeBreakdown).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <h4 className="text-lg font-semibold mb-4">By Priority</h4>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={createPieChartData(issueBreakdownData.priorityBreakdown)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {createPieChartData(issueBreakdownData.priorityBreakdown).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <h4 className="text-lg font-semibold mb-4">By Status</h4>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={createPieChartData(issueBreakdownData.statusBreakdown)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {createPieChartData(issueBreakdownData.statusBreakdown).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-6">
            <h4 className="text-lg font-semibold mb-4">By Assignee</h4>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={createPieChartData(issueBreakdownData.assigneeBreakdown)}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {createPieChartData(issueBreakdownData.assigneeBreakdown).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'velocity':
        return renderVelocityChart();
      case 'burndown':
        return renderBurndownChart();
      case 'cumulative-flow':
        return renderCumulativeFlowChart();
      case 'epic-progress':
        return renderEpicProgress();
      case 'issue-breakdown':
        return renderIssueBreakdown();
      default:
        return renderVelocityChart();
    }
  };

  return (
    <ProtectedProjectRoute allowedRoles={["Super-Admin", "ProjectLead"]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Reports & Analytics</h1>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 py-2 px-1 border-b-2 font-medium text-sm transition-colors duration-200 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
          </div>

        {/* Tab Content */}
        <Card className="p-6">
          {renderTabContent()}
        </Card>
      </div>
    </ProtectedProjectRoute>
  );
} 