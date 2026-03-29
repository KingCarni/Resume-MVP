// src/lib/ats/detectRole.ts

export type AtsCategoryKey = "titles" | "core" | "tools" | "methods" | "domain" | "outcomes";

export type RoleBank = {
  displayName: string;
  aliases: string[];
  titles: string[];
  core: string[];
  tools: string[];
  methods: string[];
  domain: string[];
  outcomes: string[];
};

export type DetectionWeights = {
  titles: number;
  core: number;
  tools: number;
  methods: number;
  domain: number;
  outcomes: number;
  aliasBonus: number;
  phraseBonus: number;
};

export type DetectionHit = {
  roleKey: string;
  roleName: string;
  category: AtsCategoryKey;
  term: string;
  count: number;
  weight: number;
  score: number;
};

export type RoleDetectionResult = {
  primaryRoleKey: string | null;
  primaryRoleName: string | null;
  secondaryRoleKey: string | null;
  secondaryRoleName: string | null;
  confidence: "low" | "medium" | "high";
  roleScores: Array<{
    roleKey: string;
    roleName: string;
    score: number;
    matchedTerms: number;
    categoryCoverage: Record<AtsCategoryKey, number>;
  }>;
  hits: DetectionHit[];
};

export type MissingTermsResult = {
  targetRoleKey: string;
  targetRoleName: string;
  tier1Critical: string[];
  tier2Important: string[];
  tier3NiceToHave: string[];
  matchedByCategory: Record<AtsCategoryKey, string[]>;
  missingByCategory: Record<AtsCategoryKey, string[]>;
  notes: string[];
};

export const ROLE_BANKS: Record<string, RoleBank> = {
  qa_tester: {
  displayName: "QA Tester",
  aliases: [
    "Test Associate",
    "Test Specialist",
    "Test Technician",
    "Functional Tester",
    "Manual Tester",
    "Compatibility Tester",
    "Localization Tester",
    "Compliance Tester",
    "Certification Tester",
    "Live Ops Tester",
    "QA Associate",
    "QA Specialist",
    "Software Tester",
    "Console Tester",
    "Mobile QA Tester",
    "QA Analyst",
    "Quality Assurance Analyst",
    "Software QA Analyst"
  ],
  titles: [
    "QA Tester",
    "Game Tester",
    "Quality Assurance Tester",
    "Game QA Tester",
    "Video Game Tester",
    "Gameplay Tester",
    "Software QA Tester",
    "QA Analyst",
    "Game QA Analyst",
    "Quality Assurance Analyst",
    "Software QA Analyst",
    "Test Associate",
    "Test Specialist",
    "Test Technician",
    "Functional Tester",
    "Manual Tester",
    "Compatibility Tester",
    "Localization Tester",
    "Compliance Tester",
    "Certification Tester",
    "Live Ops Tester",
    "QA Associate",
    "QA Specialist",
    "Software Tester",
    "Console Tester",
    "Mobile QA Tester"
  ],
  core: [
    "Game Testing",
    "Gameplay Testing",
    "Quest Testing",
    "Mission Testing",
    "Level Testing",
    "Progression Testing",
    "Economy Testing",
    "Monetization Testing",
    "Store Testing",
    "DLC Testing",
    "Patch Testing",
    "Hotfix Validation",
    "Live Ops Testing",
    "Event Testing",
    "Save/Load Testing",
    "Controller Testing",
    "Input Testing",
    "HUD Testing",
    "UI Testing",
    "UX Testing",
    "Audio Testing",
    "Localization Testing",
    "Translation Verification",
    "LQA",
    "Balance Testing",
    "Meta Testing",
    "Combat Testing",
    "Multiplayer Testing",
    "Matchmaking Testing",
    "Cross-Platform Testing",
    "Platform Certification",
    "Submission Readiness",
    "TRC",
    "TCR",
    "XR",
    "Lotcheck",
    "Compliance",
    "First-Party Requirements",
    "Console QA",
    "PC QA",
    "Mobile QA",
    "Free-to-Play",
    "F2P",
    "End-to-End Manual Testing",
    "End-to-End Testing",
    "E2E",
    "Workflow Validation",
    "Animation Workflow Validation",
    "Data Integrity Testing",
    "Workflow Integrity",
    "Permissions Testing",
    "Role-Based Access Testing",
    "Reporting Accuracy",
    "Production Workflow Testing"
  ],
  tools: [
    "JIRA",
    "Azure DevOps",
    "TestRail",
    "Confluence",
    "Mantis",
    "Bugzilla",
    "Hansoft",
    "ShotGrid",
    "Excel",
    "Google Sheets",
    "Slack",
    "Discord",
    "Dev Kits",
    "Crash Dumps",
    "Debug Logs",
    "Log Analysis",
    "Screen Capture",
    "Video Capture",
    "Packet Capture",
    "Repro Steps",
    "Database Checks",
    "SQL Basics",
    "Automation",
    "Automation Framework",
    "Automated Testing",
    "Automated Test Suites",
    "Test Automation",
    "Harmony",
    "Storyboard Pro",
    "First-Level Support",
    "R&D Support",
    "Windows",
    "Linux",
    "Mac",
    "Android",
    "Ios",
    "Apple",
    "Android"
  ],
  methods: [
    "Functional Testing",
    "Regression Testing",
    "Smoke Testing",
    "Sanity Testing",
    "Exploratory Testing",
    "Black Box Testing",
    "White Box Testing",
    "Compatibility Testing",
    "Usability Testing",
    "Acceptance Testing",
    "User Acceptance Testing",
    "UAT",
    "Risk-Based Testing",
    "Agile",
    "Scrum",
    "Kanban",
    "Sprint Testing",
    "Daily Standups",
    "Bug Triage",
    "Issue Triage",
    "Severity",
    "Priority",
    "Verification",
    "Validation",
    "Test Cases",
    "Test Plans",
    "Test Suites",
    "Checklists",
    "Bug Reports",
    "Defect Reports",
    "Daily Reports",
    "Pass/Fail Reporting",
    "Release Readiness Reports",
    "Test Metrics",
    "Coverage Reports",
    "Repro Videos",
    "Known Issues Lists",
    "Submission Checklists",
    "Patch Sign-Off",
    "Go/No-Go Input",
    "Manual Testing Methodologies",
    "Scenario Testing",
    "Test Scenarios",
    "End-to-End Testing",
    "E2E",
    "Automation Candidate Identification"
  ],
  domain: [
    "Unity",
    "Unreal Engine",
    "PC",
    "Steam",
    "Epic Games Store",
    "PlayStation",
    "PS4",
    "PS5",
    "Xbox One",
    "Xbox Series X|S",
    "Nintendo Switch",
    "iOS",
    "Android",
    "Windows",
    "macOS",
    "Mac",
    "Mac OS",
    "Linux",
    "Cross-Platform",
    "2D Pipeline",
    "3D Pipeline",
    "2D/3D Pipelines",
    "Rigs",
    "Node Networks",
    "Camera Moves",
    "Audio Sync"
  ],
  outcomes: [
    "Release Readiness",
    "Bug Prevention",
    "Defect Detection",
    "Defect Containment",
    "Reduced Repro Time",
    "Improved Coverage",
    "Regression Prevention",
    "Stable Builds",
    "Quality Improvement",
    "Workflow Integrity",
    "Production Reliability"
  ],
},

  qa_lead: {
    displayName: "QA Lead",
    aliases: ["QA Supervisor", "QA Manager", "Senior QA Lead", "Certification Lead", "Compliance Lead", "Live QA Lead", "Embedded QA Lead", "Feature QA Lead", "Project QA Lead", "QA Coordinator"],
    titles: ["QA Lead", "Lead QA", "Lead Quality Assurance", "Game QA Lead", "Quality Assurance Lead", "QA Team Lead", "Lead Tester", "Test Lead", "Lead QA Analyst", "Lead Game Tester", "QA Supervisor", "QA Manager", "Senior QA Lead", "Certification Lead", "Compliance Lead", "Live QA Lead", "Embedded QA Lead", "Feature QA Lead", "Project QA Lead", "QA Coordinator"],
    core: ["Console Certification", "TRC", "TCR", "XR", "Lotcheck", "Submission Planning", "Submission Readiness", "Live Ops QA", "Patch Validation", "DLC Validation", "Event Validation", "Monetization QA", "Free-to-Play QA", "Cross-Platform QA", "Gameplay Coverage", "Quest Coverage", "Economy Coverage", "Localization Coverage", "Accessibility Testing", "First-Party Compliance", "Co-Dev QA", "External QA", "Outsourced QA", "Player Experience", "Shipped Titles", "Release Candidate Review", "Build Health"],
    tools: ["JIRA", "Windows", "Linux", "Mac", "Android", "Ios", "Apple", "Azure DevOps", "TestRail", "Confluence", "Power BI", "Excel", "Google Sheets", "SQL", "Dashboards", "Bug Databases", "Dev Kits", "Crash Reporting", "Telemetry Dashboards", "Miro", "Notion", "Slack", "Playwright", "Xray", "X-ray", "Google", "Wiremock", "Postman", "Automation", "Teams", "Hansoft", "ShotGrid", "Defect Tracking Systems"],
    methods: ["Test Strategy", "QA Strategy", "Test Planning", "Risk-Based Testing", "Regression Planning", "Smoke Testing", "Functional Testing", "Performance Testing", "Compatibility Testing", "Automation Strategy", "Agile", "Scrum", "Kanban", "Sprint Planning", "Capacity Planning", "Resource Planning", "Workload Balancing", "Bug Triage", "Issue Triage", "Defect Lifecycle", "Root Cause Analysis", "RCA", "Postmortem", "Retrospectives", "Continuous Improvement", "Process Improvement", "Quality Gates", "Go/No-Go", "Test Plans", "Test Schedules", "Coverage Matrices", "Sign-Offs", "Release Recommendations", "Go/No-Go Recommendations", "Bug Triage Notes", "Status Reports", "Metrics Dashboards", "Risk Registers", "Test Estimates", "Hiring Plans", "Onboarding Plans", "Vendor Briefs", "Submission Checklists", "Escalation Summaries", "Team Goals", "QA Standards", "Best Practices"],
    domain: ["Unity", "Unreal Engine", "PC", "Steam", "PlayStation", "Xbox", "Nintendo Switch", "iOS", "Android"],
    outcomes: ["Release Readiness", "Quality Bar", "Risk Mitigation", "Defect Prevention", "Team Efficiency", "Coverage Expansion", "Stability Improvement", "Submission Success", "Launch Quality", "Player Satisfaction", "Process Scalability", "Reduced Escapes", "Improved Repro Quality", "Clear Prioritization", "Cross-Team Alignment", "Leadership", "Mentorship", "Coaching", "Hiring", "Interviewing", "Performance Reviews", "Decision Making", "Conflict Resolution", "Communication", "Stakeholder Management", "Cross-Functional Collaboration", "Prioritization", "Execution", "Ownership", "Accountability", "Organization", "Presentation Skills", "Escalation Management", "Influence", "Team Alignment"],
  },
  qa_engineer: {
    displayName: "QA Engineer",
    aliases: ["Automation Engineer", "Test Engineer", "QA Automation Engineer", "Build Verification Engineer", "Release Validation Engineer", "Compliance Automation Engineer", "Performance Test Engineer", "Systems Test Engineer", "Tools QA Engineer", "Gameplay QA Engineer"],
    titles: ["QA Engineer", "Game QA Engineer", "Quality Engineer", "Software QA Engineer", "SDET", "Software Development Engineer in Test", "Test Automation Engineer", "Automation QA Engineer", "Embedded QA Engineer", "Quality Assurance Engineer", "Automation Engineer", "Test Engineer", "QA Automation Engineer", "Build Verification Engineer", "Release Validation Engineer", "Compliance Automation Engineer", "Performance Test Engineer", "Systems Test Engineer", "Tools QA Engineer", "Gameplay QA Engineer"],
    core: ["Gameplay Automation", "Client Validation", "Server Validation", "Multiplayer Validation", "Netcode Validation", "Live Ops Validation", "Patch Validation", "Hotfix Validation", "Store Validation", "Economy Validation", "Telemetry Validation", "Crash Analysis", "Frame Rate Validation", "Memory Validation", "Certification Automation", "TRC", "TCR", "XR", "Lotcheck", "Dev Kits", "Platform APIs", "Shipped Titles", "Build Farm", "Console Automation"],
    tools: ["Selenium", "Windows", "Asana", "OneDrive", "SharePoint", "365", "C", "C++", "C#", "Java", "Javascript", "Python", "React", "Rest", "RPC", "GraphQL", "LLMs", "Vector", "Playwright", "Xray", "X-ray", "Google", "Wiremock", "Postman", "Automation", "Linux", "Mac", "Android", "Ios", "Apple", "Android", "Playwright", "Cypress", "Appium", "Postman", "REST API", "GraphQL", "gRPC", "Python", "Java", "C#", "JavaScript", "TypeScript", "C++", "Bash", "PowerShell", "SQL", "NoSQL", "Git", "Perforce", "Jenkins", "GitHub Actions", "GitLab CI", "CI/CD", "Docker", "Kubernetes", "Test Harness", "Automation Framework", "Test Scripts", "SDK Testing", "Service Virtualization", "Mocking", "PyTest", "JUnit", "NUnit", "xUnit", "Unreal Automation Tool", "Unity Test Framework", "Device Farm", "BrowserStack", "Charles Proxy", "Wireshark", "Crash Dumps", "Log Parsing", "Observability"],
    methods: ["API Testing", "Integration Testing", "End-to-End Testing", "E2E", "Unit Testing", "Regression Testing", "Smoke Testing", "Performance Testing", "Load Testing", "Stress Testing", "Soak Testing", "Compatibility Testing", "Continuous Testing", "Quality Gates", "Root Cause Analysis", "RCA", "Flaky Test Reduction", "Test Design", "Test Architecture", "Build Verification", "Agile", "Scrum", "Sprint Planning", "Defect Tracking", "Bug Reproduction", "Automation Frameworks", "Regression Suites", "Smoke Suites", "Test Plans", "Test Cases", "Test Data", "Coverage Reports", "Pipeline Jobs", "Quality Dashboards", "Failure Triage Reports", "Release Sign-Off Input", "Tooling", "Shared Libraries", "CI Integrations", "Test Metrics", "Validation Reports"],
    domain: ["Unity", "Unreal Engine", "PC", "Windows", "Linux", "PlayStation", "Xbox", "Nintendo Switch", "iOS", "Android", "Steam", "Epic Games Store"],
    outcomes: ["Scalability", "Maintainability", "Automation Reliability", "Reduced Manual Testing", "Faster Release Validation", "Improved Coverage", "Stability", "Defect Detection", "Lower Flake Rate", "Quality at Scale", "Build Confidence", "Release Readiness", "Performance Visibility", "Regression Prevention", "Faster Feedback", "Problem Solving", "Communication", "Collaboration", "Ownership", "Documentation", "Critical Thinking", "Attention to Detail", "Execution", "Adaptability", "Cross-Functional Collaboration"],
  },
  game_developer: {
    displayName: "Game Developer",
    aliases: ["Core Gameplay Programmer", "Feature Programmer", "Engine Programmer", "AI Programmer", "Tools Programmer", "UI Programmer", "Technical Gameplay Designer", "Combat Programmer", "Systems Developer", "Game Logic Programmer"],
    titles: ["Game Developer", "Gameplay Developer", "Gameplay Programmer", "Game Programmer", "Video Game Developer", "Game Engineer", "Systems Programmer", "Gameplay Engineer", "Game Systems Developer", "Game Software Developer", "Core Gameplay Programmer", "Feature Programmer", "Engine Programmer", "AI Programmer", "Tools Programmer", "UI Programmer", "Technical Gameplay Designer", "Combat Programmer", "Systems Developer", "Game Logic Programmer"],
    core: ["Gameplay Systems", "Player Controller", "3Cs", "Character Controller", "Camera", "Combat Systems", "AI Systems", "Pathfinding", "Behavior Trees", "State Machines", "Input Systems", "Inventory Systems", "Quest Systems", "Mission Systems", "Dialogue Systems", "Save Systems", "Serialization", "Animation Systems", "Physics Gameplay", "Collision", "Ability Systems", "Skill Trees", "Progression Systems", "Economy Systems", "Crafting Systems", "UI Flow", "HUD", "Menus", "Meta Systems", "Live Ops Support", "DLC Support", "Patch Support", "Shipped Titles", "Rapid Prototyping", "Game Feel", "Balance Tuning", "Player Experience", "Moment-to-Moment Gameplay", "Core Loop", "Multiplayer Gameplay", "Replication", "Netcode", "Latency Compensation", "Anti-Cheat Awareness"],
    tools: ["C++", "Windows", "Packer", "Ansible", "Chef", "Asana", "OneDrive", "SharePoint", "365", "C", "C++", "C#", "Java", "Javascript", "Python", "React", "Rest", "RPC", "GraphQL", "LLMs", "Vector", "ETL", "Dynamics", "CRM", "Blob", "AI", "Powerpoint", "Grafana", "BigQuery", "Tableau", "B2C", "Linux", "Mac", "Android", "Playwright", "Xray", "X-ray", "Google", "Wiremock", "Postman", "Automation", "Ios", "Apple", "C#", "Python", "Lua", "JavaScript", "TypeScript", "Blueprints", "Visual Scripting", "Git", "Perforce", "Jenkins", "GitHub Actions", "CI/CD", "Profiling", "Debugging", "Memory Optimization", "CPU Optimization", "GPU Optimization", "Multithreading", "Concurrency", "Data-Oriented Design", "Design Patterns", "SOLID", "Code Reviews", "Refactoring", "Unit Testing", "Integration Testing", "Build Systems", "Editor Tools", "Tooling", "Scripting", "Shader Basics", "Rendering", "VFX Integration", "Audio Integration", "Telemetry", "Analytics Integration", "Crash Triage", "Performance Budgets", "Frame Time", "Memory Budgets", "Hot Reload"],
    methods: ["Agile", "Scrum", "Sprint Planning", "Technical Design", "Software Architecture", "Feature Ownership", "Cross-Functional Collaboration", "Production Pipelines", "Content Pipelines", "Asset Integration", "Optimization Passes", "Bug Fixing", "Technical Debt Management", "Source Control", "Documentation", "Milestone Delivery", "Playtesting", "Iterative Development", "Build Stability", "Gameplay Features", "Prototypes", "Technical Designs", "Tools", "Systems Documentation", "Feature Specs", "Debug Builds", "Performance Reports", "Release Fixes", "Pipeline Improvements", "Content Hooks", "Reusable Components", "Gameplay Metrics Hooks", "Submission Fixes"],
    domain: ["Unreal Engine", "Unity", "Custom Engine", "Windows", "Linux", "PlayStation", "PS5", "Xbox Series X|S", "Nintendo Switch", "iOS", "Android", "Steam", "Epic Games Store", "Console Development", "PC Development", "Mobile Development"],
    outcomes: ["Performance Optimization", "Stable Builds", "Maintainability", "Scalability", "Faster Iteration", "Feature Delivery", "Reduced Bugs", "Better Feel", "Launch Readiness", "Optimized Memory", "Improved Frame Rate", "Cleaner Architecture", "Team Velocity", "Content Throughput", "Problem Solving", "Communication", "Collaboration", "Ownership", "Execution", "Adaptability", "Creativity", "Attention to Detail", "Mentoring", "Learning Mindset"],
  },
  software_engineer_game: {
    displayName: "Software Engineer (Game Industry)",
    aliases: ["Software Developer", "Backend Developer", "Full Stack Developer", "Server Engineer", "Cloud Engineer", "Release Engineer", "Developer Experience Engineer", "Site Reliability Engineer", "SRE", "Infrastructure Engineer"],
    titles: ["Software Engineer", "Backend Engineer", "Full Stack Engineer", "Services Engineer", "Platform Engineer", "Online Systems Engineer", "Game Services Engineer", "Game Backend Engineer", "Systems Engineer", "Application Engineer", "Software Developer", "Backend Developer", "Full Stack Developer", "Server Engineer", "Cloud Engineer", "Release Engineer", "Developer Experience Engineer", "Site Reliability Engineer", "SRE", "Infrastructure Engineer"],
    core: ["Online Services", "Player Account Systems", "Authentication", "Authorization", "Identity", "Commerce", "Payments", "Entitlements", "Inventory Systems", "Matchmaking", "Leaderboards", "Friends Systems", "Presence", "Game Telemetry", "Live Ops", "Live Services", "Patch Delivery", "CDN", "Content Distribution", "Anti-Cheat Services", "Session Services", "Lobby Services", "Cross-Play", "Cross-Progression", "Shipped Titles", "Launch Support", "Incident Response", "On-Call", "Release Engineering", "Developer Experience"],
    tools: ["C#", "Windows", "Spring", "BLAZOR", "MAUI", "Maven", "Mongo", "Bash", "JUnit", "IntelliJ", "TestRail", "Packer", "Ansible", "Chef", "Asana", "OneDrive", "SharePoint", "365", "C", "C++", "C#", "Java", "Javascript", "Python", "React", "Rest", "RPC", "GraphQL", "LLMs", "Vector", "ETL", "Dynamics", "CRM", "Blob", "AI", "Powerpoint", "Grafana", "BigQuery", "Tableau", "B2C", "Linux", "Mac", "Android", "Ios", "Apple", "Android", "Java", "Go", "Playwright", "Xray", "X-ray", "Google", "Wiremock", "Postman", "Automation", "Python", "Node.js", "JavaScript", "TypeScript", "C++", "SQL", "NoSQL", "PostgreSQL", "MySQL", "Redis", "MongoDB", "Cassandra", "Kafka", "RabbitMQ", "gRPC", "REST", "GraphQL", "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Terraform", "CI/CD", "Jenkins", "GitHub Actions", "GitLab CI", "Git", "Perforce", "Observability", "Monitoring", "Logging", "Alerting", "Tracing", "Load Balancing", "Caching", "Microservices", "Event-Driven Architecture", "Distributed Systems", "System Design", "API Design", "Security", "OAuth", "SAML", "Cloud Storage", "Helm", "Linux", "Unix", "Bash", "Performance Tuning", "Scalability"],
    methods: ["Agile", "Scrum", "Kanban", "Code Reviews", "Testing", "Unit Tests", "Integration Tests", "E2E Tests", "Release Management", "Incident Management", "SLA", "SLO", "Root Cause Analysis", "RCA", "Architecture Reviews", "Documentation", "Ownership", "Cross-Functional Collaboration", "Security Reviews", "Reliability Engineering", "APIs", "Backend Systems", "Developer Tools", "Build Pipelines", "Monitoring Dashboards", "Operational Runbooks", "Release Notes", "Architecture Docs", "Load Test Reports", "Migration Plans", "Service Level Objectives", "Alert Policies", "Feature Flags", "Operational Playbooks"],
    domain: ["PlayStation", "Xbox", "Nintendo Switch", "Steam", "Epic Games Store", "PC", "Mobile", "Console"],
    outcomes: ["Reliability", "Availability", "Low Latency", "Resilience", "Operational Excellence", "Launch Stability", "Faster Deployments", "Better Developer Velocity", "Reduced Downtime", "Cost Efficiency", "Global Scale", "Player Trust", "Service Health", "Problem Solving", "Communication", "Collaboration", "Execution", "Mentorship", "Design Thinking", "Trade-Offs", "Adaptability", "Customer Focus"],
  },
  producer: {
    displayName: "Producer",
    aliases: ["Project Coordinator", "Development Manager", "Delivery Manager", "Project Lead", "Production Lead", "Feature Producer", "Production Director", "Director of Production", "Executive Producer", "External Production Manager", "Co-Development Producer", "Operations Producer", "Release Producer"],
    titles: ["Producer", "Production Director", "Director of Production", "Executive Producer", "Game Producer", "Technical Producer", "Development Producer", "Associate Producer", "Senior Producer", "Live Producer", "Production Manager", "Project Manager", "Program Manager", "Project Coordinator", "Development Manager", "Delivery Manager", "Project Lead", "Production Lead", "Feature Producer", "Production Director", "Director of Production", "Executive Producer", "External Production Manager", "Co-Development Producer", "Operations Producer", "Release Producer"],
    core: ["Game Production", "AAA Development", "AA Development", "Co-Development", "External Development", "Outsourcing", "Milestones", "Vertical Slice", "Alpha", "Beta", "Gold Master", "Certification", "TRC", "TCR", "XR", "Lotcheck", "Submission Management", "Release Candidate", "Live Ops", "Seasonal Content", "DLC", "Patch Planning", "Event Planning", "Localization Coordination", "QA Coordination", "Shipped Titles", "Content Roadmap", "Playtest Coordination", "Player Experience", "Multi-Studio Development", "Cross-Disciplinary Teams"],
    tools: ["JIRA", "Windows","Spring", "BLAZOR", "MAUI", "Maven", "Mongo", "Bash", "JUnit", "IntelliJ", "TestRail", "Packer", "Ansible", "Chef", "Asana", "OneDrive", "SharePoint", "365", "C", "C++", "C#", "Java", "Javascript", "Python", "React", "Rest", "RPC", "GraphQL", "LLMs", "Vector", "ETL", "Dynamics", "CRM", "Blob", "AI", "Powerpoint", "Grafana", "BigQuery", "Tableau", "B2C", "Linux", "Mac", "Android", "Ios", "Apple", "Confluence", "Excel", "Google Sheets", "Smartsheet", "Asana", "Monday.com", "Notion", "Miro", "Playwright", "Xray", "X-ray", "Google", "Wiremock", "Postman", "Automation", "PowerPoint", "ShotGrid", "Hansoft", "Slack", "Teams", "Roadmaps", "Dashboards", "Status Reporting"],
    methods: ["Project Management", "Program Management", "Agile", "Scrum", "Kanban", "Sprint Planning", "Backlog Management", "Roadmapping", "Milestone Planning", "Schedule Management", "Dependency Management", "Risk Management", "Issue Tracking", "Escalation Management", "Resource Planning", "Capacity Planning", "Budget Management", "Forecasting", "Scope Management", "Change Management", "Go-to-Market Coordination", "Release Planning", "Go/No-Go", "Retrospectives", "Burndown", "Velocity", "OKRs", "Workflow Optimization", "Schedules", "Milestone Plans", "Risk Registers", "Dependency Maps", "Status Reports", "Executive Updates", "Meeting Notes", "Action Item Trackers", "Launch Plans", "Release Checklists", "Communication Plans", "Team Goals", "Staffing Plans", "Postmortems", "Process Docs", "Partner Briefs"],
    domain: ["Unity", "Unreal Engine", "PlayStation", "Xbox", "Nintendo Switch", "PC", "Mobile"],
    outcomes: ["On-Time Delivery", "On-Budget Delivery", "Team Alignment", "Predictable Execution", "Risk Mitigation", "Roadblock Removal", "Cross-Team Coordination", "Launch Readiness", "Operational Excellence", "Content Throughput", "Quality Bar", "Stakeholder Confidence", "Clear Communication", "Healthy Production Rhythm", "Execution Discipline", "Leadership", "Communication", "Facilitation", "Decision Making", "Conflict Resolution", "Prioritization", "Ownership", "Accountability", "Organization", "Collaboration", "Influence", "Follow-Through", "Problem Solving", "Adaptability", "Presentation Skills"],
  },
  product_owner: {
    displayName: "Product Owner",
    aliases: ["Associate Product Manager", "Senior Product Manager", "Technical Product Manager", "Live Ops Product Manager", "Economy Product Manager", "Player Experience Product Manager", "CRM Product Manager", "Content Product Manager", "Release Product Owner", "Scrum Product Owner"],
    titles: ["Product Owner", "Game Product Owner", "Product Manager", "Game Product Manager", "Live Product Manager", "Feature Owner", "Platform Product Owner", "Monetization Product Manager", "Growth Product Manager", "Product Lead", "Associate Product Manager", "Senior Product Manager", "Technical Product Manager", "Live Ops Product Manager", "Economy Product Manager", "Player Experience Product Manager", "CRM Product Manager", "Content Product Manager", "Release Product Owner", "Scrum Product Owner"],
    core: ["Player Experience", "Engagement", "Retention", "Monetization", "F2P", "Live Ops", "In-Game Events", "Battle Pass", "Storefront", "Offers", "Bundles", "Pricing", "Economy Design", "Progression Design", "A/B Testing", "Experimentation", "Segmentation", "Cohort Analysis", "Churn", "LTV", "ARPU", "ARPPU", "DAU", "MAU", "WAU", "Feature Adoption", "Conversion", "Funnels", "Session Length", "Player Feedback", "Community Feedback", "Surveys", "Competitive Analysis", "Roadmap Alignment", "Release Planning", "Content Planning", "Launch Planning"],
    tools: ["JIRA", "Playwright","Spring", "BLAZOR", "MAUI", "Maven", "Mongo", "Bash", "JUnit", "IntelliJ", "TestRail", "Packer", "Ansible", "Chef", "Asana", "OneDrive", "SharePoint", "365", "C", "C++", "C#", "Java", "Javascript", "Python", "React", "Rest", "RPC", "GraphQL", "LLMs", "Vector", "ETL", "Dynamics", "CRM", "Blob", "AI", "Powerpoint", "Grafana", "BigQuery", "Tableau", "B2C", "Xray", "X-ray", "Google", "Wiremock", "Postman", "Automation", "Windows", "Linux", "Mac", "Android", "Ios", "Apple", "Confluence", "Amplitude", "Mixpanel", "Looker", "Tableau", "Power BI", "Google Analytics", "Excel", "SQL", "Airtable", "Miro", "Notion", "Optimizely", "Feature Flags", "Dashboards", "Telemetry", "Event Taxonomy"],
    methods: ["Backlog Management", "User Stories", "Acceptance Criteria", "Prioritization", "Roadmapping", "Product Strategy", "Product Vision", "Requirements Gathering", "Agile", "Scrum", "Kanban", "Sprint Planning", "Sprint Reviews", "Backlog Grooming", "Refinement", "MVP", "Hypothesis Testing", "Success Metrics", "Product Discovery", "Go-to-Market", "Stakeholder Management", "Risk Management", "Scope Management", "Outcome Ownership", "Value Delivery", "Roadmaps", "PRDs", "Experiment Briefs", "Metric Trees", "Launch Plans", "Prioritization Frameworks", "Requirements Docs", "Competitive Audits", "Decision Logs", "Feature Specs", "Post-Launch Readouts", "Stakeholder Updates", "Opportunity Assessments"],
    domain: ["PC", "Console", "Mobile", "Free-to-Play", "Premium", "Cross-Platform"],
    outcomes: ["Revenue Growth", "Retention Lift", "Engagement Lift", "Conversion Improvement", "Reduced Churn", "Player Value", "Clear Prioritization", "Roadmap Clarity", "Feature-Market Fit", "Player Satisfaction", "Business Impact", "Validated Learning", "Faster Iteration", "Aligned Stakeholders", "Stronger Live Ops Performance", "Communication", "Decision Making", "Trade-Offs", "Collaboration", "Player-Centric Thinking", "Analytical Thinking", "Ownership", "Influence", "Adaptability", "Execution", "Storytelling", "Stakeholder Alignment"],
  },
  game_artist: {
    displayName: "Game Artist",
    aliases: ["Visual Designer", "Technical Artist", "Lighting Artist", "Material Artist", "UI/UX Artist", "Creature Artist", "Animation Artist", "World Artist", "Weapon Artist", "Senior Artist"],
    titles: ["Game Artist", "2D Artist", "3D Artist", "Concept Artist", "Character Artist", "Environment Artist", "UI Artist", "VFX Artist", "Prop Artist", "Illustrator", "Visual Designer", "Technical Artist", "Lighting Artist", "Material Artist", "UI/UX Artist", "Creature Artist", "Animation Artist", "World Artist", "Weapon Artist", "Senior Artist"],
    core: ["Game Art", "Stylized Art", "Realistic Art", "Visual Development", "World Building", "Visual Storytelling", "Character Design", "Environment Design", "Prop Design", "Hard Surface", "Organic Modeling", "Creature Design", "Weapons", "Vehicles", "UI Mockups", "HUD Art", "Iconography", "Splash Art", "Marketing Key Art", "In-Engine Art", "Asset Integration", "Gameplay Readability", "Silhouette", "Shape Language", "Composition", "Color Theory", "PBR", "Material Definition", "Texture Budgets", "Polygon Budgets", "LODs", "Optimization", "Console Constraints", "Mobile Constraints", "Shipped Titles", "Art Bibles", "Style Guides", "Feedback Iteration"],
    tools: ["Photoshop", "Windows","Spring", "BLAZOR", "MAUI", "Maven", "Mongo", "Bash", "JUnit", "IntelliJ", "TestRail", "Packer", "Ansible", "Chef", "ETL", "Dynamics", "CRM", "Blob", "AI", "Powerpoint", "Grafana", "BigQuery", "Tableau", "B2C", "Linux", "Mac", "Android", "Ios", "Apple", "Figma", "Blender", "Maya", "3ds Max", "ZBrush", "Substance Painter", "Substance Designer", "After Effects", "Spine", "Aseprite", "Marmoset Toolbag", "Marvelous Designer", "RizomUV", "KeyShot", "ShotGrid", "Perforce", "Git", "JIRA", "Confluence", "Texture Atlasing", "UV Mapping", "Retopology", "Rigging", "Skinning", "Animation", "VFX", "Particles", "Shaders", "Lighting", "Rendering"],
    methods: ["Asset Pipeline", "Asana", "OneDrive", "SharePoint", "365", "C", "C++", "C#", "Java", "Javascript", "Python", "React", "Rest", "RPC", "GraphQL", "LLMs", "Vector", "Production Pipelines", "Reference Gathering", "Mood Boards", "Playwright", "Xray", "X-ray", "Google", "Wiremock", "Postman", "Automation", "Iteration", "Art Reviews", "Feedback Cycles", "Naming Conventions", "File Management", "Task Estimation", "Time Management", "Cross-Functional Collaboration", "Documentation", "Optimization Passes", "Import Pipelines", "Quality Bar", "Concept Sheets", "Model Sheets", "Turnarounds", "Orthographics", "3D Assets", "Textures", "Materials", "UI Kits", "Icon Sets", "VFX Packages", "Presentation Decks", "In-Engine Scenes", "Look Dev", "Lighting Passes", "Polish Passes", "Portfolio Pieces"],
    domain: ["Unity", "Unreal Engine", "PC", "Console", "Mobile", "AR/VR"],
    outcomes: ["Visual Clarity", "Production Quality", "Readability", "Strong Art Direction", "Consistent Style", "Optimized Assets", "Faster Integration", "Player Immersion", "Clear Feedback", "High Visual Fidelity", "Efficient Pipeline", "Lower Rework", "Better Presentation", "Shippable Content", "Polish", "Creativity", "Communication", "Collaboration", "Attention to Detail", "Ownership", "Adaptability", "Critique Handling", "Presentation Skills", "Problem Solving", "Organization", "Artistic Judgment", "Empathy"],
  },
  data_scientist_game: {
    displayName: "Data Scientist",
    aliases: ["Quantitative Analyst", "Experimentation Scientist", "Behavioral Data Scientist", "Applied Scientist", "Analytics Manager", "Senior Data Scientist", "Player Behavior Analyst", "Economy Scientist", "Growth Scientist", "ML Scientist"],
    titles: ["Data Scientist", "Game Data Scientist", "Product Data Scientist", "Analytics Scientist", "Decision Scientist", "Machine Learning Scientist", "Player Insights Scientist", "Research Scientist", "Monetization Data Scientist", "Live Ops Data Scientist", "Quantitative Analyst", "Experimentation Scientist", "Behavioral Data Scientist", "Applied Scientist", "Analytics Manager", "Senior Data Scientist", "Player Behavior Analyst", "Economy Scientist", "Growth Scientist", "ML Scientist"],
    core: ["Player Behavior", "Retention Modeling", "Churn Prediction", "LTV Modeling", "Player Segmentation", "Cohort Analysis", "Funnel Analysis", "Engagement Metrics", "Session Analysis", "Monetization Analytics", "Economy Analytics", "Matchmaking Analytics", "Fraud Detection", "Cheat Detection", "Recommender Systems", "Offer Optimization", "A/B Testing", "Experimentation", "Live Ops Analytics", "Telemetry", "Event Taxonomy", "Instrumentation", "DAU", "MAU", "WAU", "ARPU", "ARPPU", "ARPDAU", "Conversion", "Payer Conversion", "Battle Pass", "F2P", "North Star Metrics", "Feature Adoption", "Skill Rating", "Player Journey", "Player Sentiment", "Survey Analysis"],
    tools: ["Python", "R", "SQL", "Spring", "BLAZOR", "MAUI", "Maven", "Mongo", "Bash", "JUnit", "IntelliJ", "TestRail", "Packer", "Ansible", "Chef","Asana", "OneDrive", "SharePoint", "365", "C", "C++", "C#", "Java", "Javascript", "Python", "React", "Rest", "RPC", "GraphQL", "LLMs", "Vector", "ETL", "Dynamics", "CRM", "Blob", "AI", "Powerpoint", "Grafana", "BigQuery", "Tableau", "B2C", "Playwright", "Xray", "X-ray", "Google", "Wiremock", "Postman", "Automation", "Windows","Linux","Mac", "Android", "Ios", "Apple", "Pandas", "NumPy", "SciPy", "scikit-learn", "XGBoost", "LightGBM", "PyTorch", "TensorFlow", "Jupyter", "Databricks", "BigQuery", "Snowflake", "Spark", "PySpark", "dbt", "Airflow", "Tableau", "Looker", "Power BI", "Matplotlib", "Plotly", "Seaborn", "Git", "Docker", "APIs", "Feature Stores", "MLflow", "Experiment Tracking", "Bayesian Methods"],
    methods: ["Machine Learning", "Predictive Modeling", "Classification", "Regression", "Clustering", "Recommendation Systems", "Hypothesis Testing", "Statistical Significance", "Confidence Intervals", "Causal Inference", "Sampling", "Feature Engineering", "Model Evaluation", "Cross Validation", "Precision", "Recall", "F1 Score", "ROC AUC", "Time Series", "Forecasting", "Anomaly Detection", "Model Monitoring", "Drift Detection", "MLOps", "Data Storytelling", "Dashboards", "Experiment Readouts", "Model Artifacts", "Feature Importance Analyses", "Segmentation Schemes", "Forecasts", "Insight Decks", "Metric Definitions", "Decision Memos", "Model Validation Reports", "KPI Trees", "Player Insight Reports", "Telemetry Specs", "Notebook Analyses", "Recommendations"],
    domain: ["PC", "Console", "Mobile", "Cross-Platform", "Live Service"],
    outcomes: ["Better Retention", "Revenue Lift", "Experiment Velocity", "Smarter Live Ops Decisions", "Player Understanding", "Improved Conversion", "Reduced Churn", "Healthier Economy", "Better Match Quality", "Fraud Reduction", "Faster Insights", "Model Accuracy", "Business Impact", "Actionable Analytics", "Data-Informed Decisions", "Communication", "Stakeholder Management", "Curiosity", "Analytical Thinking", "Problem Solving", "Ownership", "Storytelling", "Collaboration", "Business Acumen", "Player Empathy", "Experiment Mindset", "Adaptability"],
  },
  data_engineer_game: {
    displayName: "Data Engineer",
    aliases: ["Senior Data Engineer", "Data Integration Engineer", "Pipeline Engineer", "Warehouse Engineer", "Lakehouse Engineer", "Analytics Platform Engineer", "DataOps Engineer", "BI Engineer", "Telemetry Data Engineer", "Cloud Data Engineer"],
    titles: ["Data Engineer", "Game Data Engineer", "Analytics Engineer", "Big Data Engineer", "ETL Engineer", "ELT Engineer", "Platform Data Engineer", "Data Platform Engineer", "Streaming Data Engineer", "Machine Learning Data Engineer", "Senior Data Engineer", "Data Integration Engineer", "Pipeline Engineer", "Warehouse Engineer", "Lakehouse Engineer", "Analytics Platform Engineer", "DataOps Engineer", "BI Engineer", "Telemetry Data Engineer", "Cloud Data Engineer"],
    core: ["Telemetry Pipelines", "Event Ingestion", "Player Analytics", "Live Ops Data", "Experimentation Support", "A/B Test Data", "Economy Data", "Monetization Data", "Session Data", "Crash Data", "Gameplay Events", "User Acquisition Data", "Attribution Data", "Feature Stores", "ML Data Pipelines", "Real-Time Data", "Shipped Titles", "Backfills", "Reprocessing", "Data Contracts", "Event Taxonomy", "Player Account Data", "Commerce Data"],
    tools: ["Python", "SQL", "Packer","Spring", "BLAZOR", "MAUI", "Maven", "Mongo", "Bash", "JUnit", "IntelliJ", "TestRail", "Packer", "Ansible", "Chef", "Ansible", "Chef", "ETL", "Asana", "OneDrive", "SharePoint", "365", "C", "C++", "C#", "Java", "Javascript", "Python", "React", "Rest", "RPC", "GraphQL", "LLMs", "Vector", "Dynamics", "CRM", "Blob", "AI", "Powerpoint", "Grafana", "BigQuery", "Tableau", "B2C", "Scala", "Java", "Spark", "PySpark", "Airflow", "Dagster", "dbt", "Kafka", "Windows", "Playwright", "Xray", "X-ray", "Google", "Wiremock", "Postman", "Automation", "Linux", "Mac", "Android", "Ios", "Apple", "Android", "Kinesis", "Pub/Sub", "Databricks", "BigQuery", "Snowflake", "Redshift", "S3", "GCS", "ADLS", "Parquet", "Avro", "ORC", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Cassandra", "ClickHouse", "Trino", "Presto", "Docker", "Kubernetes", "Terraform", "Git", "GitHub Actions", "CI/CD", "REST APIs", "gRPC", "Microservices", "Cloud", "AWS", "GCP", "Azure", "Glue", "Iceberg", "Delta Lake"],
    methods: ["ETL", "ELT", "Batch Processing", "Streaming", "Data Modeling", "Dimensional Modeling", "Star Schema", "Snowflake Schema", "Data Warehousing", "Lakehouse", "Data Quality", "Data Validation", "Observability", "Monitoring", "Alerting", "Lineage", "Metadata", "Catalog", "Data Governance", "Access Control", "IAM", "Security", "PII Handling", "Compliance", "Partitioning", "Clustering", "Indexing", "Performance Tuning", "Orchestration", "Scheduling", "Reliability Engineering", "Fault Tolerance", "SLA", "SLO", "Incident Response", "Pipelines", "Data Models", "Warehouse Tables", "Semantic Layers", "ETL Jobs", "Streaming Jobs", "Data Quality Checks", "Orchestration DAGs", "Runbooks", "Monitoring Dashboards", "Backfill Plans", "Schema Definitions", "Event Specs", "Documentation", "Access Policies", "Incident Reviews"],
    domain: ["PC", "Console", "Mobile", "Cross-Platform"],
    outcomes: ["Reliable Data", "Scalable Pipelines", "Faster Analytics", "Trusted Metrics", "Lower Latency", "Better Experimentation", "Operational Stability", "Data Accessibility", "Cost Efficiency", "Data Freshness", "High Throughput", "Lower Failure Rates", "Faster Backfills", "Better Governance", "ML Readiness", "Problem Solving", "Communication", "Collaboration", "Ownership", "Execution", "Systems Thinking", "Adaptability", "Reliability", "Stakeholder Partnership"],
  }
};

const DEFAULT_WEIGHTS: DetectionWeights = {
  titles: 14,
  core: 8,
  tools: 7,
  methods: 5,
  domain: 5,
  outcomes: 4,
  aliasBonus: 8,
  phraseBonus: 2,
};

const CATEGORY_ORDER: AtsCategoryKey[] = ["titles", "core", "tools", "methods", "domain", "outcomes"];

const ROLE_TITLE_OVERRIDE_PATTERNS: Record<string, RegExp[]> = {
  qa_tester: [
    /\bqa tester\b/i,
    /\bgame tester\b/i,
    /\bquality assurance tester\b/i,
    /\btest analyst\b/i,
  ],
  qa_lead: [
    /\bqa lead\b/i,
    /\bquality lead\b/i,
    /\btest lead\b/i,
    /\bqa manager\b/i,
  ],
  qa_engineer: [
    /\bqa engineer\b/i,
    /\btest automation engineer\b/i,
    /\bsdet\b/i,
    /\bquality engineer\b/i,
  ],
  game_developer: [
    /\bgame developer\b/i,
    /\bgame programmer\b/i,
    /\bgameplay programmer\b/i,
    /\bgame engineer\b/i,
  ],
  software_engineer_game: [
    /\bsoftware engineer\b/i,
    /\bbackend engineer\b/i,
    /\bfull stack engineer\b/i,
    /\bservices engineer\b/i,
    /\bplatform engineer\b/i,
    /\btechnical director\b/i,
  ],
  producer: [
    /\bproduction director\b/i,
    /\bdirector of production\b/i,
    /\bexecutive producer\b/i,
    /\bsenior producer\b/i,
    /\bproducer\b/i,
    /\bproduction lead\b/i,
  ],
  product_owner: [
    /\bproduct owner\b/i,
    /\bproduct manager\b/i,
    /\bdirector of product\b/i,
  ],
  game_artist: [
    /\bgame artist\b/i,
    /\bart director\b/i,
    /\btechnical artist\b/i,
    /\benvironment artist\b/i,
    /\bcharacter artist\b/i,
    /\bui artist\b/i,
  ],
  data_scientist_game: [
    /\bdata scientist\b/i,
    /\bmachine learning scientist\b/i,
    /\bml scientist\b/i,
  ],
  data_engineer_game: [
    /\bdata engineer\b/i,
    /\banalytics engineer\b/i,
    /\bplatform data engineer\b/i,
  ],
};

function normalizeText(input: string): string {
  return (
    " " +
    String(input || "")
      .toLowerCase()
      .replace(/[\u2013\u2014]/g, "-")
      .replace(/[^a-z0-9+#/. -]+/g, " ")
      .replace(/\s+/g, " ")
      .trim() +
    " "
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countWholePhrase(text: string, phrase: string): number {
  const p = phrase.trim().toLowerCase();
  if (!p) return 0;
  const regex = new RegExp(`(^|[^a-z0-9+#/])${escapeRegExp(p)}(?=$|[^a-z0-9+#/])`, "gi");
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = String(value || "").trim().toLowerCase();
    const clean = String(value || "").trim();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}


function normalizeRoleLookupKey(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^a-z0-9+#/. -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeEvidence(input: string): string[] {
  const stop = new Set([
    "and",
    "or",
    "the",
    "a",
    "an",
    "of",
    "for",
    "to",
    "with",
    "in",
    "on",
    "at",
    "by",
    "from",
    "into",
    "through",
    "across",
    "bar",
    "team",
    "teams",
  ]);

  return normalizeRoleLookupKey(input)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => token.length >= 2)
    .filter((token) => !stop.has(token));
}

function buildTargetPositionCandidates(targetPosition: string): string[] {
  const clean = String(targetPosition || "").trim();
  if (!clean) return [];

  const normalized = normalizeRoleLookupKey(clean);
  const candidates = [clean, normalized];

  const splitters = ["|", "/", "(", "-", "—", "–", ","];
  for (const splitter of splitters) {
    const left = clean.split(splitter)[0]?.trim();
    if (left && left.length >= 3) candidates.push(left);
  }

  return uniqueCaseInsensitive(
    candidates
      .map((value) => normalizeRoleLookupKey(value))
      .filter(Boolean)
  );
}

function roleTitleEvidenceScore(targetPosition: string, role: RoleBank): number {
  const candidates = buildTargetPositionCandidates(targetPosition);
  if (!candidates.length) return 0;

  let best = 0;
  const terms = uniqueCaseInsensitive([...role.titles, ...role.aliases, role.displayName]);

  for (const candidate of candidates) {
    const candidateTokens = tokenizeEvidence(candidate);
    for (const rawTerm of terms) {
      const term = normalizeRoleLookupKey(rawTerm);
      if (!term) continue;

      if (candidate === term) best = Math.max(best, 220);
      else if (candidate.includes(term) || term.includes(candidate)) best = Math.max(best, 170);
      else {
        const termTokens = tokenizeEvidence(term);
        const shared = candidateTokens.filter((token) => termTokens.includes(token)).length;
        const ratio = termTokens.length ? shared / termTokens.length : 0;
        if (shared >= 2 && ratio >= 0.6) best = Math.max(best, 120 + Math.round(ratio * 30));
        else if (shared >= 1 && ratio >= 0.5) best = Math.max(best, 80 + Math.round(ratio * 20));
      }
    }
  }

  return best;
}

export function resolveRoleKeyFromTargetPosition(targetPosition: string): string | null {
  const clean = String(targetPosition || "").trim();
  if (!clean) return null;

  let bestRoleKey: string | null = null;
  let bestScore = 0;

  for (const [roleKey, role] of Object.entries(ROLE_BANKS)) {
    const score = roleTitleEvidenceScore(clean, role);
    if (score > bestScore) {
      bestScore = score;
      bestRoleKey = roleKey;
    }
  }

  return bestScore >= 80 ? bestRoleKey : null;
}

function getRoleDisplayName(roleKey: string | null): string | null {
  return roleKey ? ROLE_BANKS[roleKey]?.displayName ?? null : null;
}

function getCategoryPriority(category: AtsCategoryKey): number {
  switch (category) {
    case "titles":
      return 6;
    case "core":
      return 5;
    case "methods":
      return 4;
    case "tools":
      return 3;
    case "domain":
      return 2;
    case "outcomes":
      return 1;
    default:
      return 0;
  }
}

function categoryRelevanceThresholds(category: AtsCategoryKey) {
  switch (category) {
    case "titles":
      return { strong: 1, moderate: 1 };
    case "tools":
    case "domain":
      return { strong: 0.8, moderate: 0.66 };
    case "core":
      return { strong: 0.66, moderate: 0.5 };
    case "methods":
    case "outcomes":
      return { strong: 0.6, moderate: 0.5 };
    default:
      return { strong: 0.66, moderate: 0.5 };
  }
}

function evaluateJobTermRelevance(args: {
  jobText: string;
  targetPosition?: string;
  term: string;
  category: AtsCategoryKey;
}): {
  exact: boolean;
  titleExact: boolean;
  strong: boolean;
  moderate: boolean;
  ratio: number;
  tokenHits: number;
  score: number;
} {
  const normalizedJob = normalizeText(`${args.targetPosition || ""}\n${args.jobText || ""}`);
  const normalizedTitle = normalizeText(args.targetPosition || "");
  const tokens = tokenizeEvidence(args.term);

  const exact = countWholePhrase(normalizedJob, args.term) > 0;
  const titleExact = args.targetPosition ? countWholePhrase(normalizedTitle, args.term) > 0 : false;

  const tokenHits = tokens.filter((token) => normalizedJob.includes(` ${token} `)).length;
  const ratio = tokens.length ? tokenHits / tokens.length : 0;
  const thresholds = categoryRelevanceThresholds(args.category);

  const strong =
    exact ||
    titleExact ||
    (tokens.length >= 2 && ratio >= thresholds.strong) ||
    (tokens.length === 1 && tokenHits >= 1 && (args.category === "core" || args.category === "methods"));

  const moderate =
    strong ||
    (tokens.length >= 2 && ratio >= thresholds.moderate) ||
    (tokens.length === 1 && tokenHits >= 1 && ["core", "methods", "outcomes"].includes(args.category));

  const score =
    (titleExact ? 130 : 0) +
    (exact ? 100 : 0) +
    tokenHits * 16 +
    Math.round(ratio * 24) +
    (strong ? 18 : 0) +
    (moderate ? 8 : 0) +
    getCategoryPriority(args.category) * 3;

  return {
    exact,
    titleExact,
    strong,
    moderate,
    ratio,
    tokenHits,
    score,
  };
}

function suppressSiblingTerms(terms: string[], targetPosition = "", jobText = ""): string[] {
  const normalizedJob = normalizeRoleLookupKey(`${targetPosition} ${jobText}`);
  const seen = new Set<string>();
  const out: string[] = [];

  const exactTitle = normalizeRoleLookupKey(targetPosition);

  for (const rawTerm of terms) {
    const term = String(rawTerm || "").trim();
    if (!term) continue;

    const key = normalizeRoleLookupKey(term);
    if (!key || seen.has(key)) continue;

    if (key === "aa development" && normalizedJob.includes("aaa")) continue;
    if (key === "producer" && exactTitle.includes("production director")) continue;
    if (key === "game production" && exactTitle.includes("production director")) continue;

    seen.add(key);
    out.push(term);
  }

  return out;
}

export function getMissingTermsForApplication(
  resumeText: string,
  targetRoleKey: string,
  jobText: string,
  targetPosition = ""
): MissingTermsResult {
  const role = ROLE_BANKS[targetRoleKey];
  if (!role) {
    throw new Error(`Unknown role key: ${targetRoleKey}`);
  }

  const text = normalizeText(resumeText);

  const matchedByCategory: Record<AtsCategoryKey, string[]> = {
    titles: [],
    core: [],
    tools: [],
    methods: [],
    domain: [],
    outcomes: [],
  };

  const missingByCategory: Record<AtsCategoryKey, string[]> = {
    titles: [],
    core: [],
    tools: [],
    methods: [],
    domain: [],
    outcomes: [],
  };

  for (const category of CATEGORY_ORDER) {
    const rankedMissing = uniqueCaseInsensitive(role[category])
      .map((term, index) => {
        const count = countWholePhrase(text, term);
        if (count > 0) {
          matchedByCategory[category].push(term);
          return null;
        }

        const relevance = evaluateJobTermRelevance({
          jobText,
          targetPosition,
          term,
          category,
        });

        const fallbackAllowed =
          category === "core" || category === "methods" || category === "outcomes";

        const toolOrDomainExplicit =
          (category === "tools" || category === "domain") &&
          (relevance.exact || relevance.strong || (relevance.moderate && relevance.tokenHits >= 1));

        return {
          term,
          index,
          relevance,
          include:
            relevance.titleExact ||
            relevance.exact ||
            relevance.strong ||
            toolOrDomainExplicit ||
            (relevance.moderate && category !== "titles" && category !== "tools" && category !== "domain") ||
            (fallbackAllowed && index < (category === "core" ? 6 : 4)),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .filter((entry) => entry.include)
      .sort((a, b) => b.relevance.score - a.relevance.score || a.index - b.index)
      .map((entry) => entry.term);

    missingByCategory[category] = suppressSiblingTerms(rankedMissing, targetPosition, jobText);
  }

  const jdExplicitTools = missingByCategory.tools.filter((term) => {
    const relevance = evaluateJobTermRelevance({
      jobText,
      targetPosition,
      term,
      category: "tools",
    });
    return relevance.exact || relevance.strong || (relevance.moderate && relevance.tokenHits >= 1);
  });

  const jdExplicitDomain = missingByCategory.domain.filter((term) => {
    const relevance = evaluateJobTermRelevance({
      jobText,
      targetPosition,
      term,
      category: "domain",
    });
    return relevance.exact || relevance.strong || (relevance.moderate && relevance.tokenHits >= 1);
  });

  const tier1Critical = uniqueCaseInsensitive(
    suppressSiblingTerms(
      [
        ...missingByCategory.titles.slice(0, 2),
        ...missingByCategory.core.slice(0, 8),
        ...jdExplicitTools.slice(0, 8),
      ],
      targetPosition,
      jobText
    )
  );

  const tier2Important = uniqueCaseInsensitive(
    suppressSiblingTerms(
      [
        ...missingByCategory.methods.slice(0, 8),
        ...jdExplicitDomain.slice(0, 8),
        ...missingByCategory.outcomes.slice(0, 6),
      ],
      targetPosition,
      jobText
    )
  );

  const tier3NiceToHave = uniqueCaseInsensitive(
    suppressSiblingTerms(
      [
        ...missingByCategory.titles.slice(2),
        ...missingByCategory.core.slice(8),
        ...missingByCategory.tools.slice(6),
        ...missingByCategory.methods.slice(8),
        ...missingByCategory.domain.slice(6),
        ...missingByCategory.outcomes.slice(6),
      ],
      targetPosition,
      jobText
    )
  );

  const notes: string[] = [];

  if (matchedByCategory.titles.length === 0) {
    notes.push("No direct target title signal found. Consider honest title alignment in summary or title mirrors.");
  }
  if (matchedByCategory.tools.length < 2) {
    notes.push("Tooling signal is light for this application. Skills + experience bullets may be underselling hard-skill depth.");
  }
  if (matchedByCategory.methods.length < 2) {
    notes.push("Process/method signal is thin for this job. Add workflows, planning, delivery, or operating patterns where supported.");
  }
  if (matchedByCategory.outcomes.length === 0) {
    notes.push("Outcome language is weak. Add measurable impact, quality bar, release value, or player/business effect where truthful.");
  }

  return {
    targetRoleKey,
    targetRoleName: role.displayName,
    tier1Critical,
    tier2Important,
    tier3NiceToHave,
    matchedByCategory,
    missingByCategory,
    notes,
  };
}


export function detectGameRole(
  resumeText: string,
  weights: Partial<DetectionWeights> = {}
): RoleDetectionResult {
  const merged = { ...DEFAULT_WEIGHTS, ...weights };
  const text = normalizeText(resumeText);

  const hits: DetectionHit[] = [];
  const roleScores = Object.entries(ROLE_BANKS).map(([roleKey, role]) => {
    let score = 0;
    let matchedTerms = 0;
    const categoryCoverage: Record<AtsCategoryKey, number> = {
      titles: 0,
      core: 0,
      tools: 0,
      methods: 0,
      domain: 0,
      outcomes: 0,
    };

    for (const category of CATEGORY_ORDER) {
      const terms = uniqueCaseInsensitive(role[category]);
      for (const term of terms) {
        const count = countWholePhrase(text, term);
        if (!count) continue;

        const multiWordBonus = term.includes(" ") ? merged.phraseBonus : 0;
        const weight = merged[category] + multiWordBonus;
        const termScore = count * weight;

        score += termScore;
        matchedTerms += 1;
        categoryCoverage[category] += 1;

        hits.push({
          roleKey,
          roleName: role.displayName,
          category,
          term,
          count,
          weight,
          score: termScore,
        });
      }
    }

    for (const alias of uniqueCaseInsensitive(role.aliases)) {
      const count = countWholePhrase(text, alias);
      if (!count) continue;

      const termScore = count * merged.aliasBonus;
      score += termScore;

      hits.push({
        roleKey,
        roleName: role.displayName,
        category: "titles",
        term: alias,
        count,
        weight: merged.aliasBonus,
        score: termScore,
      });
    }

    return {
      roleKey,
      roleName: role.displayName,
      score,
      matchedTerms,
      categoryCoverage,
    };
  });

  roleScores.sort((a, b) => b.score - a.score);

  const primary = roleScores[0] ?? null;
  const secondary = roleScores[1] ?? null;

  let confidence: "low" | "medium" | "high" = "low";
  if (primary && primary.score >= 70) confidence = "medium";
  if (primary && primary.score >= 120) confidence = "high";
  if (primary && secondary && primary.score < secondary.score * 1.15) confidence = "low";

  return {
    primaryRoleKey: primary?.roleKey ?? null,
    primaryRoleName: primary?.roleName ?? null,
    secondaryRoleKey: secondary?.roleKey ?? null,
    secondaryRoleName: secondary?.roleName ?? null,
    confidence,
    roleScores,
    hits: hits.sort((a, b) => b.score - a.score),
  };
}


export function getMissingTermsForTargetRole(
  resumeText: string,
  targetRoleKey: string
): MissingTermsResult {
  return getMissingTermsForApplication(resumeText, targetRoleKey, "", "");
}

export function detectRoleAndMissingTerms(
  resumeText: string,
  forcedTargetRoleKey?: string,
  jobText = "",
  targetPosition = ""
) {
  const detection = detectGameRole(resumeText);
  const targetRoleKey =
    forcedTargetRoleKey ??
    resolveRoleKeyFromTargetPosition(targetPosition) ??
    detection.primaryRoleKey;

  return {
    detection,
    missingTerms: targetRoleKey
      ? getMissingTermsForApplication(resumeText, targetRoleKey, jobText, targetPosition)
      : null,
  };
}
