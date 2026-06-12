import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, Clock, CheckCircle, Users, Target, Heart, Activity, AlertCircle } from 'lucide-react';

const LBWAssessments = () => {
  const navigate = useNavigate();
  const [selectedAssessment, setSelectedAssessment] = useState(null);
  const [notice, setNotice] = useState(null);

  const assessments = [
    {
      id: 'adhd-rating',
      title: 'ADHD Rating Scale',
      description: 'Comprehensive evaluation of attention, hyperactivity, and executive function symptoms',
      icon: '',
      color: 'pink',
      estimatedTime: 15,
      questions: 18,
      category: 'ADHD Support'
    },
    {
      id: 'gad-7',
      title: 'GAD-7 Anxiety Scale',
      description: 'Generalized Anxiety Disorder scale to assess anxiety symptoms and severity',
      icon: '',
      color: 'yellow',
      estimatedTime: 5,
      questions: 7,
      category: 'Stress Management'
    },
    {
      id: 'pss-10',
      title: 'Perceived Stress Scale (PSS-10)',
      description: 'Measures your stress levels and coping mechanisms over the past month',
      icon: '‍️',
      color: 'orange',
      estimatedTime: 10,
      questions: 10,
      category: 'Stress Management'
    },
    {
      id: 'memory-cognitive',
      title: 'Memory & Cognitive Assessment',
      description: 'Evaluate your working memory, recall abilities, and cognitive processing speed',
      icon: '',
      color: 'teal',
      estimatedTime: 20,
      questions: 6,
      category: 'Memory Enhancement'
    },
    {
      id: 'mood-emotional',
      title: 'Mood & Emotional Regulation Assessment',
      description: 'Comprehensive mood evaluation including depression and emotional regulation',
      icon: '️',
      color: 'yellow',
      estimatedTime: 12,
      questions: 5,
      category: 'Wellness'
    }
  ];

  const totalTime = assessments.reduce((total, assessment) => total + assessment.estimatedTime, 0);

  const handleStartAssessment = (assessment) => {
    setSelectedAssessment(assessment);
    setNotice(`${assessment.title} — assessment module coming soon.`);
    setTimeout(() => setNotice(null), 4000);
  };

  const handleFullSuite = () => {
    setNotice('Full assessment suite coming soon.');
    setTimeout(() => setNotice(null), 4000);
  };

  const getColorClasses = (color) => {
    const colorMap = {
      pink: 'bg-pink-100 text-pink-600',
      yellow: 'bg-yellow-100 text-yellow-600',
      orange: 'bg-orange-100 text-orange-600',
      teal: 'bg-teal-100 text-[#323956]'
    };
    return colorMap[color] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#E4EFFF] via-white to-teal-50">
      {notice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-[#323956] text-white px-6 py-3 rounded-lg shadow-lg text-sm">
          {notice}
        </div>
      )}
      {/* Header with Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-100">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/')}
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                ← Back
              </button>
              <div className="flex items-center gap-2">
                <Brain className="h-6 w-6 text-[#323956]" />
                <span className="text-xl font-bold text-gray-900">Limitless Brain Wellness</span>
                <span className="text-sm text-gray-500">by Dr. Sweta Adatia</span>
              </div>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] transition-colors"
            >
              Dashboard
            </button>
          </div>
        </div>
      </nav>

      {/* Category Pills */}
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-wrap gap-2 justify-center">
          <span className="px-4 py-2 bg-pink-100 text-pink-700 rounded-full text-sm font-medium">
             ADHD Support
          </span>
          <span className="px-4 py-2 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
             Memory Enhancement
          </span>
          <span className="px-4 py-2 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
             Stress Management
          </span>
          <span className="px-4 py-2 bg-teal-100 text-teal-700 rounded-full text-sm font-medium">
            IDEA: Cognitive Training
          </span>
          <span className="px-4 py-2 bg-[#CAE0FF] text-blue-700 rounded-full text-sm font-medium">
            DATA: Progress Tracking
          </span>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">Brain Wellness Assessments</h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Complete these evidence-based assessments to get personalized insights and recommendations.
            </p>
          </div>

          {/* Assessment Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {assessments.map((assessment) => (
              <div
                key={assessment.id}
                className="bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow border border-gray-100"
              >
                <div className="p-6">
                  <div className={`w-14 h-14 ${getColorClasses(assessment.color).split(' ')[0]} rounded-lg flex items-center justify-center mb-4`}>
                    <span className="text-2xl">{assessment.icon}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{assessment.title}</h3>
                  <p className="text-gray-600 text-sm mb-4">{assessment.description}</p>
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm text-gray-500">~{assessment.estimatedTime} minutes</span>
                    <span className={`text-sm font-medium ${getColorClasses(assessment.color).split(' ')[1]}`}>
                      {assessment.questions} questions
                    </span>
                  </div>
                  <button
                    onClick={() => handleStartAssessment(assessment)}
                    className="w-full px-4 py-2 bg-[#323956] text-white rounded-lg hover:bg-[#232D3C] transition-colors font-medium"
                  >
                    Start Assessment
                  </button>
                </div>
              </div>
            ))}

            {/* Complete Assessment Suite Card */}
            <div className="bg-gradient-to-br from-teal-500 to-blue-600 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
              <div className="p-6 text-white">
                <div className="w-14 h-14 bg-white bg-opacity-20 rounded-lg flex items-center justify-center mb-4">
                  <span className="text-2xl">⭐</span>
                </div>
                <h3 className="text-xl font-semibold mb-2">Complete Assessment Suite</h3>
                <p className="text-white text-opacity-90 text-sm mb-4">
                  Take all assessments in one session for the most comprehensive brain fitness analysis.
                </p>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm text-white text-opacity-75">~{totalTime} minutes</span>
                  <span className="text-sm font-medium">Full Suite</span>
                </div>
                <button
                  onClick={handleFullSuite}
                  className="w-full px-4 py-2 bg-white bg-opacity-20 text-white rounded-lg hover:bg-opacity-30 transition-all font-medium backdrop-blur-sm"
                >
                  Start Full Assessment
                </button>
              </div>
            </div>
          </div>

          {/* Assessment History Section */}
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Your Assessment History</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl"></span>
                    <div>
                      <h4 className="font-semibold text-gray-900">ADHD Assessment</h4>
                      <p className="text-sm text-gray-600">Completed 3 days ago • Score: 68/100</p>
                    </div>
                  </div>
                </div>
                <button className="px-4 py-2 text-[#323956] hover:text-blue-700 font-medium">
                  View Results →
                </button>
              </div>

              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl">‍️</span>
                    <div>
                      <h4 className="font-semibold text-gray-900">Stress Scale (PSS)</h4>
                      <p className="text-sm text-gray-600">Completed 1 week ago • Score: 24/40</p>
                    </div>
                  </div>
                </div>
                <button className="px-4 py-2 text-[#323956] hover:text-blue-700 font-medium">
                  View Results →
                </button>
              </div>

              <div className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl"></span>
                    <div>
                      <h4 className="font-semibold text-gray-900">Memory Assessment</h4>
                      <p className="text-sm text-gray-600">Completed 2 weeks ago • Score: 82/100</p>
                    </div>
                  </div>
                </div>
                <button className="px-4 py-2 text-[#323956] hover:text-blue-700 font-medium">
                  View Results →
                </button>
              </div>

              <div className="text-center py-6 border-t border-gray-200">
                <p className="text-gray-500 mb-4">
                  Take regular assessments to track your progress over time.
                </p>
                <button className="px-6 py-3 bg-gradient-to-r from-blue-600 to-teal-600 text-white rounded-lg hover:shadow-lg transition-all font-medium">
                  View Full History
                </button>
              </div>
            </div>
          </div>

          {/* Info Cards */}
          <div className="grid md:grid-cols-3 gap-6 mt-8">
            <div className="bg-[#E4EFFF] rounded-lg p-6 border border-blue-100">
              <Heart className="h-8 w-8 text-[#323956] mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Evidence-Based</h3>
              <p className="text-sm text-gray-600">All assessments are scientifically validated and used by healthcare professionals.</p>
            </div>
            <div className="bg-teal-50 rounded-lg p-6 border border-teal-100">
              <Activity className="h-8 w-8 text-[#323956] mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Personalized Insights</h3>
              <p className="text-sm text-gray-600">Get customized recommendations based on your unique brain wellness profile.</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-6 border border-purple-100">
              <Target className="h-8 w-8 text-purple-600 mb-3" />
              <h3 className="font-semibold text-gray-900 mb-2">Track Progress</h3>
              <p className="text-sm text-gray-600">Monitor improvements over time with our comprehensive tracking system.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LBWAssessments;