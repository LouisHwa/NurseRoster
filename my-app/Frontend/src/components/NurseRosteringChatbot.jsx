"use client";
import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Wifi, WifiOff, AlertTriangle, Database, Shield, CheckCircle, XCircle, ExternalLink, Clock, Users, Calendar } from "lucide-react";

// Secure AWS SDK v3 Integration
class SecureLexService {
  constructor() {
    this.userId = null;
    this.lexClient = null;
    this.connectionStatus = 'initializing';
    // Temporary hardcoded values for testing - replace with your actual values
    this.config = {
      region: 'us-east-1',
      botId: 'OG2KTGDTYM', // Your actual Bot ID
      botAliasId: 'WRRTFQ1SWO', // Your actual Bot Alias ID
      localeId: 'en_US',
      cognitoIdentityPoolId: 'us-east-1:a619da6a-0df2-42dc-a13e-efff8a9567a0', // Your Cognito Pool ID
      lambdaFunctionName: 'BridgeToS3' // Your Lambda Function Name
    };
    this.lastError = null;
    
    // Debug log to verify values
    console.log('Service initialized with config:', {
      region: this.config.region,
      botId: this.config.botId,
      botAliasId: this.config.botAliasId,
      cognitoIdentityPoolId: this.config.cognitoIdentityPoolId,
      lambdaFunctionName: this.config.lambdaFunctionName
    });
  }

  async initialize() {
    try {
      if (typeof window !== 'undefined' && !this.userId) {
        this.userId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }

      console.log('Initializing with config:', {
        region: this.config.region,
        botId: this.config.botId ? 'Set' : 'Missing',
        botAliasId: this.config.botAliasId ? 'Set' : 'Missing',
        cognitoIdentityPoolId: this.config.cognitoIdentityPoolId ? 'Set' : 'Missing'
      });

      // Check required configuration
      if (!this.config.botId || !this.config.botAliasId) {
        this.connectionStatus = 'missing_config';
        this.lastError = 'Bot ID or Alias ID missing';
        return;
      }

      // For secure browser-based AWS access, we need Cognito Identity Pool
      if (this.config.cognitoIdentityPoolId) {
        await this.initializeWithCognito();
      } else {
        // Fallback to API endpoint if you have one
        if (process.env.REACT_APP_API_GATEWAY_URL) {
          await this.initializeWithAPI();
        } else {
          this.connectionStatus = 'needs_auth_setup';
          this.lastError = 'No secure authentication method configured';
        }
      }

    } catch (error) {
      console.error('Lex initialization failed:', error);
      this.connectionStatus = 'error';
      this.lastError = error.message;
    }
  }

  async initializeWithCognito() {
    try {
      // Import AWS SDK v3 modules dynamically
      const { LexRuntimeV2Client, RecognizeTextCommand } = await import('@aws-sdk/client-lex-runtime-v2');
      const { fromCognitoIdentityPool } = await import('@aws-sdk/credential-provider-cognito-identity');
      const { CognitoIdentityClient } = await import('@aws-sdk/client-cognito-identity');

      // Set up Cognito credentials
      const credentials = fromCognitoIdentityPool({
        client: new CognitoIdentityClient({ region: this.config.region }),
        identityPoolId: this.config.cognitoIdentityPoolId,
      });

      // Create Lex client
      this.lexClient = new LexRuntimeV2Client({
        region: this.config.region,
        credentials: credentials,
      });

      // Test connection
      await this.testConnection();
      this.connectionStatus = 'connected';
      console.log('Successfully connected to AWS Lex via Cognito');

    } catch (error) {
      console.error('Cognito initialization failed:', error);
      throw new Error(`Cognito setup failed: ${error.message}`);
    }
  }

  async initializeWithAPI() {
    // If you have an API Gateway endpoint that handles AWS calls server-side
    this.apiEndpoint = process.env.REACT_APP_API_GATEWAY_URL;
    
    try {
      const response = await fetch(`${this.apiEndpoint}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        this.connectionStatus = 'connected_api';
      } else {
        throw new Error(`API health check failed: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`API connection failed: ${error.message}`);
    }
  }

  async testConnection() {
    const testParams = {
      botId: this.config.botId,
      botAliasId: this.config.botAliasId,
      localeId: this.config.localeId,
      sessionId: this.userId,
      text: 'test connection'
    };

    const { RecognizeTextCommand } = await import('@aws-sdk/client-lex-runtime-v2');
    const command = new RecognizeTextCommand(testParams);
    const response = await this.lexClient.send(command);
    
    console.log('Connection test successful:', response);
    return response;
  }

  async sendMessage(userInput) {
    if (!this.userId) {
      await this.initialize();
    }

    switch (this.connectionStatus) {
      case 'connected':
        return await this.sendToRealLex(userInput);
      case 'connected_api':
        return await this.sendViaAPI(userInput);
      default:
        return await this.simulateResponse(userInput);
    }
  }

  async sendToRealLex(userInput) {
    try {
      const { RecognizeTextCommand } = await import('@aws-sdk/client-lex-runtime-v2');
      
      const params = {
        botId: this.config.botId,
        botAliasId: this.config.botAliasId,
        localeId: this.config.localeId,
        sessionId: this.userId,
        text: userInput,
      };

      const command = new RecognizeTextCommand(params);
      const response = await this.lexClient.send(command);

      console.log('Lex response:', response);

      // Handle Lex response with card groups support
      let content = "I processed your request but didn't get a clear response.";
      let responseCards = null;
      
      if (response.messages && response.messages.length > 0) {
        // Extract text messages
        const textMessages = response.messages.filter(msg => msg.contentType === 'PlainText');
        if (textMessages.length > 0) {
          content = textMessages.map(msg => msg.content).join('\n');
        }
        
        // Extract response cards/card groups
        const cardMessages = response.messages.filter(msg => 
          msg.contentType === 'ImageResponseCard' || 
          msg.contentType === 'ResponseCard'
        );
        
        if (cardMessages.length > 0) {
          responseCards = cardMessages.map(msg => {
            if (msg.imageResponseCard) {
              return {
                type: 'imageResponseCard',
                title: msg.imageResponseCard.title,
                subtitle: msg.imageResponseCard.subtitle,
                imageUrl: msg.imageResponseCard.imageUrl,
                buttons: msg.imageResponseCard.buttons || []
              };
            } else if (msg.responseCard) {
              return {
                type: 'responseCard',
                version: msg.responseCard.version,
                contentType: msg.responseCard.contentType,
                genericAttachments: msg.responseCard.genericAttachments || []
              };
            }
            return null;
          }).filter(Boolean);
        }
      } else if (response.sessionState?.intent?.name) {
        content = `I understood your intent: ${response.sessionState.intent.name}. Let me process that for you.`;
      }

      return {
        content,
        intent: response.sessionState?.intent?.name,
        confidence: response.interpretations?.[0]?.nluConfidence?.score,
        source: 'aws_lex',
        sessionState: response.sessionState,
        responseCards: responseCards, // Include response cards
        rawResponse: response // Keep full response for debugging
      };

    } catch (error) {
      console.error("AWS Lex error:", error);
      
      // Fallback to simulation on error
      this.connectionStatus = 'error';
      this.lastError = error.message;
      return await this.simulateResponse(userInput);
    }
  }

  async sendViaAPI(userInput) {
    try {
      const response = await fetch(`${this.apiEndpoint}/lex-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userInput,
          sessionId: this.userId,
          botId: this.config.botId,
          botAliasId: this.config.botAliasId
        })
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      return {
        content: data.response,
        intent: data.intent,
        confidence: data.confidence,
        source: 'api_gateway',
        responseCards: data.responseCards || null
      };

    } catch (error) {
      console.error("API error:", error);
      throw new Error(`API communication failed: ${error.message}`);
    }
  }

  async simulateResponse(userInput) {
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1500));
    
    const input = userInput.toLowerCase();
    
    // Enhanced simulation responses for your specific use case
    if (input.includes('schedule') || input.includes('roster') || input.includes('shift')) {
      return {
        content: `🏥 **Schedule Creation Simulation**

**AWS Configuration Status:**
• Lex Bot ID: ${this.config.botId || 'Not set'}
• Bot Alias: ${this.config.botAliasId || 'Not set'}  
• Lambda Function: ${this.config.lambdaFunctionName || 'Not set'}
• Region: ${this.config.region}

**Your Request:** Create nurse schedule
**Simulated Processing:** 
✅ Intent recognized: CreateScheduleIntent
⚡ Would invoke Lambda function: ${this.config.lambdaFunctionName}
📊 Malaysian healthcare compliance check: PASSED
🔄 Staff optimization algorithm: COMPLETED

**Mock Results:**
• Total shifts generated: 126
• Compliance score: 96.8%
• Cost optimization: 12% savings
• Staff satisfaction index: 94%

**To enable real processing:**
1. Your Cognito Identity Pool: ${this.config.cognitoIdentityPoolId ? '✅ Configured' : '❌ Missing'}
2. Lex Bot permissions: Need IAM role setup
3. Lambda integration: Configure bot fulfillment`,

        intent: 'CreateScheduleIntent',
        confidence: 0.92,
        source: 'simulation',
        responseCards: [
          {
            type: 'imageResponseCard',
            title: 'Schedule Options',
            subtitle: 'Choose your scheduling action',
            buttons: [
              { text: 'Create New Schedule', value: 'create_schedule' },
              { text: 'Modify Existing', value: 'modify_schedule' },
              { text: 'View Current', value: 'view_schedule' }
            ]
          }
        ]
      };
      
    } else if (input.includes('compliance') || input.includes('audit')) {
      return {
        content: `📋 **Compliance Audit Simulation**

**Malaysian Employment Act Compliance Check:**

✅ **Working Hours:** Maximum 44 hours/week - COMPLIANT
✅ **Rest Periods:** Minimum 11 hours between shifts - COMPLIANT  
✅ **Consecutive Days:** Maximum 6 working days - COMPLIANT
✅ **Overtime Limits:** Within legal boundaries - COMPLIANT
⚠️ **Minor Issues:** 2 scheduling gaps detected in ICU

**Real AWS Lex Integration Status:**
• Bot: ${this.config.botId ? 'Configured' : 'Missing'}
• Lambda: ${this.config.lambdaFunctionName ? 'Ready' : 'Not configured'}
• Auth: ${this.config.cognitoIdentityPoolId ? 'Cognito ready' : 'Setup required'}

**Simulated Compliance Score: 97.3%**

With proper AWS setup, this would pull real data from your hospital systems and provide actual compliance reports.`,

        intent: 'ComplianceCheckIntent',
        confidence: 0.89,
        source: 'simulation',
        responseCards: [
          {
            type: 'imageResponseCard',
            title: 'Compliance Actions',
            subtitle: 'What would you like to do next?',
            buttons: [
              { text: 'Generate Report', value: 'generate_compliance_report' },
              { text: 'Fix Issues', value: 'fix_compliance_issues' },
              { text: 'Schedule Audit', value: 'schedule_audit' }
            ]
          }
        ]
      };
      
    } else if (input.includes('staff') || input.includes('available') || input.includes('nurse')) {
      return {
        content: `👥 **Staff Availability Simulation**

**Current Staffing Status:**
• Total Nurses: 127
• Currently Available: 89
• On Duty: 38
• On Leave: 12
• Emergency Pool: 18

**Ward Breakdown:**
🏥 ICU: 12/10 required (✅ Optimal)
🚨 Emergency: 8/12 required (⚠️ Understaffed)
🏥 General: 25/20 required (✅ Overstaffed)
👶 Maternity: 15/14 required (✅ Optimal)

**Your AWS Resources:**
• Lex Bot ID: ${this.config.botId}
• Lambda Function: ${this.config.lambdaFunctionName}
• Connection Status: ${this.connectionStatus}

In production, this would query your hospital's HR system via Lambda function "${this.config.lambdaFunctionName}" and provide real-time staff data.`,

        intent: 'StaffAvailabilityIntent',
        confidence: 0.85,
        source: 'simulation',
        responseCards: [
          {
            type: 'imageResponseCard',
            title: 'Staff Management',
            subtitle: 'Manage your nursing staff',
            buttons: [
              { text: 'Call Emergency Staff', value: 'call_emergency_staff' },
              { text: 'Reassign Nurses', value: 'reassign_nurses' },
              { text: 'View Detailed Report', value: 'detailed_staff_report' },
              { text: 'Schedule Overtime', value: 'schedule_overtime' }
            ]
          }
        ]
      };
      
    } else {
      return {
        content: `🤖 **AWS Lex Nurse Rostering Assistant**

**Current Configuration:**
• Region: ${this.config.region}
• Lex Bot: ${this.config.botId || 'Not configured'}
• Lambda: ${this.config.lambdaFunctionName || 'Not configured'}
• Cognito Pool: ${this.config.cognitoIdentityPoolId ? 'Available' : 'Not configured'}
• Status: ${this.connectionStatus}

**What I can help with:**
🗓️ **"Create schedule for ICU next week"** - Generate optimized nurse rosters
📋 **"Check compliance status"** - Malaysian employment law audit
👥 **"Show available staff"** - Real-time staffing levels
⚡ **"Optimize current roster"** - Cost and satisfaction optimization

**Security Note:** This simulation shows how your actual AWS resources would respond. For production use, ensure your Cognito Identity Pool has proper IAM permissions for Lex and Lambda access.

${this.lastError ? `\n⚠️ **Last Error:** ${this.lastError}` : ''}`,

        intent: 'WelcomeIntent',
        confidence: 0.75,
        source: 'simulation',
        responseCards: [
          {
            type: 'imageResponseCard',
            title: 'Quick Actions',
            subtitle: 'Choose what you want to do',
            buttons: [
              { text: 'Create Schedule', value: 'create schedule for next week' },
              { text: 'Check Compliance', value: 'check compliance status' },
              { text: 'View Staff', value: 'show available staff' },
              { text: 'Help & Support', value: 'help' }
            ]
          }
        ]
      };
    }
  }

  getConnectionStatus() {
    return {
      status: this.connectionStatus,
      error: this.lastError,
      config: this.config,
      hasRequiredConfig: !!(this.config.botId && this.config.botAliasId),
      hasAuth: !!(this.config.cognitoIdentityPoolId || process.env.REACT_APP_API_GATEWAY_URL)
    };
  }

  getUserId() {
    return this.userId;
  }
}

// Component to render response cards
const ResponseCards = ({ cards, onCardClick }) => {
  if (!cards || cards.length === 0) return null;

  return (
    <div className="mt-4 space-y-3">
      {cards.map((card, index) => (
        <div key={index} className="bg-white border border-gray-200 rounded-lg shadow-sm">
          {card.type === 'imageResponseCard' && (
            <div className="p-4">
              {card.title && (
                <h3 className="font-semibold text-gray-900 mb-1">{card.title}</h3>
              )}
              {card.subtitle && (
                <p className="text-sm text-gray-600 mb-3">{card.subtitle}</p>
              )}
              {card.imageUrl && (
                <img 
                  src={card.imageUrl} 
                  alt={card.title || 'Response card image'}
                  className="w-full max-w-xs h-auto rounded-lg mb-3"
                />
              )}
              {card.buttons && card.buttons.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {card.buttons.map((button, btnIndex) => (
                    <button
                      key={btnIndex}
                      onClick={() => onCardClick(button.value || button.text)}
                      className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors duration-200 text-left"
                    >
                      {button.text}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          
          {card.type === 'responseCard' && card.genericAttachments && (
            <div className="p-4">
              {card.genericAttachments.map((attachment, attIndex) => (
                <div key={attIndex} className="mb-4">
                  {attachment.title && (
                    <h3 className="font-semibold text-gray-900 mb-1">{attachment.title}</h3>
                  )}
                  {attachment.subTitle && (
                    <p className="text-sm text-gray-600 mb-2">{attachment.subTitle}</p>
                  )}
                  {attachment.imageUrl && (
                    <img 
                      src={attachment.imageUrl} 
                      alt={attachment.title || 'Attachment image'}
                      className="w-full max-w-xs h-auto rounded-lg mb-3"
                    />
                  )}
                  {attachment.attachmentLinkUrl && (
                    <a 
                      href={attachment.attachmentLinkUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      View Details
                    </a>
                  )}
                  {attachment.buttons && attachment.buttons.length > 0 && (
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {attachment.buttons.map((button, btnIndex) => (
                        <button
                          key={btnIndex}
                          onClick={() => onCardClick(button.value || button.text)}
                          className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors duration-200 text-left"
                        >
                          {button.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const SecureNurseRosteringChatbot = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [lexService] = useState(() => new SecureLexService());
  const [connectionInfo, setConnectionInfo] = useState({});
  const [isClient, setIsClient] = useState(false);

  const messagesEndRef = useRef(null);

  useEffect(() => {
    setIsClient(true);
    
    setMessages([{
      id: 1,
      type: "bot",
      content: "🤖 AWS Lex Nurse Rostering System\n\n🔄 Initializing secure connection...\n🔐 Checking authentication setup...\n⚡ Loading your AWS resources...\n\nI'll help you with intelligent nurse scheduling using your configured AWS services.",
      timestamp: new Date().toLocaleTimeString(),
      source: 'system'
    }]);

    const initService = async () => {
      await lexService.initialize();
      const status = lexService.getConnectionStatus();
      setConnectionInfo(status);
      
      // Generate status message based on actual configuration
      let statusMessage = "";
      
      switch (status.status) {
        case 'connected':
          statusMessage = `✅ **AWS Lex Connected Successfully!**

🤖 **Your Bot Configuration:**
• Bot ID: ${status.config.botId}
• Alias: ${status.config.botAliasId}  
• Region: ${status.config.region}
• Lambda: ${status.config.lambdaFunctionName}

🔐 **Authentication:** Cognito Identity Pool active
⚡ **Status:** Ready for natural language processing
🏥 **Compliance:** Malaysian healthcare rules loaded

Ask me anything about nurse scheduling!`;
          break;
          
        case 'connected_api':
          statusMessage = `✅ **Connected via API Gateway**

Your backend API is handling AWS integration securely.
Ready to process nurse scheduling requests!`;
          break;
          
        case 'needs_auth_setup':
          statusMessage = `⚠️ **Authentication Setup Required**

**Your AWS Resources Found:**
• Lex Bot: ${status.config.botId}
• Lambda: ${status.config.lambdaFunctionName}
• Region: ${status.config.region}

**Missing Secure Authentication:**
Raw AWS credentials don't work in browsers for security.

**Solutions:**
1. **Cognito Identity Pool** (Recommended)
   - Your Pool ID: ${status.config.cognitoIdentityPoolId}
   - Configure IAM roles for Lex/Lambda access

2. **API Gateway Backend**  
   - Create backend API to handle AWS calls
   - Keep credentials server-side

3. **For Testing Only:** Use AWS CLI or Postman to test your Lex bot directly

Currently running in **simulation mode** with your actual resource IDs.`;
          break;
          
        case 'missing_config':
          statusMessage = `⚙️ **Configuration Missing**

Required environment variables:
❌ REACT_APP_LEX_BOT_ID: ${status.config.botId || 'Not set'}
❌ REACT_APP_LEX_BOT_ALIAS_ID: ${status.config.botAliasId || 'Not set'}
✅ REACT_APP_AWS_REGION: ${status.config.region}

Set these in your .env file to continue.`;
          break;
          
        default:
          statusMessage = `❌ **Connection Failed**

Error: ${status.error}

Your configuration:
• Bot ID: ${status.config.botId || 'Missing'}
• Region: ${status.config.region}
• Auth Method: ${status.hasAuth ? 'Available' : 'Not configured'}

Check your AWS setup and try refreshing.`;
      }
      
      setMessages(prev => prev.map(msg => 
        msg.id === 1 ? { 
          ...msg, 
          content: msg.content.replace(
            /🔄 Initializing.*?I'll help you with intelligent nurse scheduling using your configured AWS services\./s, 
            statusMessage
          )
        } : msg
      ));
    };

    initService();
  }, [lexService]);

  useEffect(() => {
    if (isClient) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isClient]);

  const handleCardClick = (value) => {
    setInput(value);
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage = { 
      id: Date.now(), 
      type: "user", 
      content: input.trim(),
      timestamp: new Date().toLocaleTimeString()
    };
    setMessages((prev) => [...prev, userMessage]);

    const userInput = input.trim();
    setInput("");
    setIsProcessing(true);

    try {
      const response = await lexService.sendMessage(userInput);
      const botMessage = { 
        id: Date.now() + 1, 
        type: "bot", 
        content: response.content,
        timestamp: new Date().toLocaleTimeString(),
        intent: response.intent,
        confidence: response.confidence,
        source: response.source,
        responseCards: response.responseCards // Add response cards
      };
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Send message error:', error);
      const errorMessage = { 
        id: Date.now() + 2, 
        type: "bot", 
        content: `❌ **Error Processing Request**

${error.message}

**Troubleshooting:**
• Check if your Lex bot is deployed and active
• Verify IAM permissions for your Cognito Identity Pool
• Ensure Lambda function "${connectionInfo.config?.lambdaFunctionName}" exists
• Test bot directly in AWS Console first

**Current Status:** ${connectionInfo.status}`,
        timestamp: new Date().toLocaleTimeString(),
        error: true
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsProcessing(false);
    }
  };

  const getConnectionDisplay = () => {
    switch (connectionInfo.status) {
      case 'connected':
        return { 
          icon: <CheckCircle className="w-4 h-4 text-green-500" />, 
          text: 'AWS Lex Connected', 
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200'
        };
      case 'connected_api':
        return { 
          icon: <Shield className="w-4 h-4 text-blue-500" />, 
          text: 'API Connected', 
          color: 'text-blue-600',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-200'
        };
      case 'needs_auth_setup':
        return { 
          icon: <AlertTriangle className="w-4 h-4 text-orange-500" />, 
          text: 'Auth Setup Needed', 
          color: 'text-orange-600',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200'
        };
      case 'missing_config':
        return { 
          icon: <XCircle className="w-4 h-4 text-red-500" />, 
          text: 'Config Missing', 
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        };
      default:
        return { 
          icon: <WifiOff className="w-4 h-4 text-red-500" />, 
          text: 'Connection Failed', 
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200'
        };
    }
  };

  const connectionDisplay = getConnectionDisplay();

  // Don't render the full UI until client-side to prevent hydration mismatch
  if (!isClient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 flex items-center justify-center">
        <div className="text-center">
          <Database className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600">Loading AWS Lex Nurse Rostering...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-white rounded-t-2xl p-6 border-b flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-3">
            <Database className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">AWS Lex Nurse Rostering</h1>
              <p className="text-sm text-gray-600">Secure AI-Powered Scheduling Assistant</p>
            </div>
          </div>
          
          <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg border ${connectionDisplay.bgColor} ${connectionDisplay.borderColor}`}>
            {connectionDisplay.icon}
            <span className={`text-sm font-medium ${connectionDisplay.color}`}>
              {connectionDisplay.text}
            </span>
          </div>
        </div>

        {/* Configuration Status */}
        {connectionInfo.config && (
          <div className="bg-white px-6 py-3 border-b">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="flex items-center space-x-2">
                <span className="text-gray-500">Bot:</span>
                <span className={`font-mono ${connectionInfo.config.botId ? 'text-green-600' : 'text-red-600'}`}>
                  {connectionInfo.config.botId ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-500">Lambda:</span>
                <span className={`font-mono ${connectionInfo.config.lambdaFunctionName ? 'text-green-600' : 'text-red-600'}`}>
                  {connectionInfo.config.lambdaFunctionName ? '✓' : '✗'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-500">Auth:</span>
                <span className={`font-mono ${connectionInfo.hasAuth ? 'text-green-600' : 'text-orange-600'}`}>
                  {connectionInfo.hasAuth ? '✓' : '⚠'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-gray-500">Region:</span>
                <span className="font-mono text-blue-600">{connectionInfo.config?.region}</span>
              </div>
            </div>
          </div>
        )}

        {/* Chat Area */}
        <div className="flex-1 bg-white shadow flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start space-x-4 ${
                  msg.type === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.type === "bot" && (
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                )}
                
                <div className={`max-w-3xl ${msg.type === "user" ? "order-first" : ""}`}>
                  <div
                    className={`p-4 rounded-2xl ${
                      msg.type === "user"
                        ? "bg-blue-600 text-white ml-auto"
                        : msg.error
                          ? "bg-red-50 text-red-900 border border-red-200"
                          : "bg-gray-50 text-gray-900 border border-gray-200"
                    }`}
                  >
                    {/* Bot message metadata */}
                    {msg.type === "bot" && !msg.error && msg.source && msg.source !== 'system' && (
                      <div className="flex items-center space-x-3 mb-3 text-xs">
                        <span className={`px-2 py-1 rounded-full font-medium ${
                          msg.source === 'aws_lex' ? 'bg-green-100 text-green-700' : 
                          msg.source === 'api_gateway' ? 'bg-blue-100 text-blue-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {msg.source === 'aws_lex' ? 'AWS Lex' : 
                           msg.source === 'api_gateway' ? 'API Gateway' :
                           'Simulation'}
                        </span>
                        {msg.intent && <span className="text-gray-500">Intent: {msg.intent}</span>}
                        {msg.confidence && <span className="text-gray-500">Confidence: {Math.round(msg.confidence * 100)}%</span>}
                      </div>
                    )}
                    
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    
                    {msg.timestamp && (
                      <div className={`text-xs mt-3 opacity-70 ${
                        msg.type === "user" ? "text-blue-100" : "text-gray-500"
                      }`}>
                        {msg.timestamp}
                      </div>
                    )}
                  </div>

                  {/* Render Response Cards */}
                  {msg.type === "bot" && msg.responseCards && (
                    <ResponseCards 
                      cards={msg.responseCards} 
                      onCardClick={handleCardClick}
                    />
                  )}
                </div>

                {msg.type === "user" && (
                  <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-white" />
                  </div>
                )}
              </div>
            ))}
            
            {/* Processing indicator */}
            {isProcessing && (
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                  <Bot className="w-5 h-5 text-white animate-pulse" />
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200">
                  <div className="flex items-center space-x-3 text-sm text-gray-600">
                    <div className="flex space-x-1">
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                    <span>
                      {connectionInfo.status === 'connected' ? 'AWS Lex processing your request...' : 
                       connectionInfo.status === 'connected_api' ? 'API processing your request...' :
                       'Processing your request...'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-6 border-t bg-gray-50 rounded-b-2xl">
            <div className="flex space-x-4">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about nurse scheduling, compliance checks, or staff management..."
                className="flex-1 p-4 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                disabled={isProcessing}
                autoComplete="off"
                suppressHydrationWarning={true}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isProcessing}
                className="px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-2 text-sm font-medium"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </div>
            
            <div className="mt-3 text-center">
              <span className={`text-xs ${connectionDisplay.color}`}>
                {connectionInfo.status === 'connected' 
                  ? `AWS Lex Active • Bot: ${connectionInfo.config?.botId?.slice(-8)} • Session: ${isClient ? lexService.getUserId()?.slice(-8) || 'Loading...' : 'Loading...'}` 
                  : connectionInfo.status === 'connected_api'
                  ? 'Connected via secure API • Full functionality available'
                  : `${connectionDisplay.text} • Simulation mode active with your AWS resource IDs`
                }
              </span>
            </div>
            
            {connectionInfo.status === 'needs_auth_setup' && (
              <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-start space-x-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-800 mb-1">Authentication Setup Required</p>
                    <p className="text-orange-700 mb-2">Your AWS resources are configured but need secure authentication:</p>
                    <div className="space-y-1 text-xs text-orange-600">
                      <p><strong>Option 1:</strong> Set up Cognito Identity Pool (recommended for production)</p>
                      <p><strong>Option 2:</strong> Create backend API to handle AWS calls server-side</p>
                      <p><strong>Option 3:</strong> Test your Lex bot directly in AWS Console first</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecureNurseRosteringChatbot;