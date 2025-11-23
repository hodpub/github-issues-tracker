import {
    fetchRepositoryData,
    getContrastColor,
    showError,
    escapeHtml,
    setupCommonUI,
    getInitialRepos,
    setupLoadButton,
    setupAdBanner,
    formatMarkdown,
    formatDate,
    renderIssueDetails
} from './shared.mjs';

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    setupCommonUI();
    setupAdBanner();
    setupLoadButton(loadAllRepositories);
    
    // Setup issue detail panel handlers
    const iframePanel = document.getElementById('iframePanel');
    const closeIframe = document.getElementById('closeIframe');

    closeIframe.addEventListener('click', () => {
        iframePanel.classList.remove('open');
    });

    // Handle clicks on issue cards
    document.addEventListener('click', async (e) => {
        // Check if clicked on item card or its children (but not the external link)
        const item = e.target.closest('.item');
        const link = e.target.closest('a.item-title');
        
        if (item && !link) {
            e.preventDefault();
            
            const issueData = JSON.parse(item.dataset.issue);
            const iframeTitle = document.getElementById('iframeTitle');
            const detailsContent = document.getElementById('detailsContent');
            const detailsLoading = document.getElementById('detailsLoading');
            
            // Show in detail panel
            iframeTitle.textContent = 'Loading...';
            iframePanel.classList.add('open');
            detailsContent.innerHTML = '';
            detailsLoading.style.display = 'block';
            
            try {
                loadIssueDetails(issueData, iframeTitle, detailsContent);
            } catch (error) {
                detailsContent.innerHTML = `<div class="error">Failed to load issue details: ${error.message}</div>`;
            } finally {
                detailsLoading.style.display = 'none';
            }
        }
    });
    
    // Auto-load on page load with initial repos
    const initialRepos = getInitialRepos();
    if (initialRepos && initialRepos.length > 0) {
        // Update URL with initial repos
        const url = new URL(window.location);
        url.searchParams.set('repos', initialRepos.join(','));
        window.history.replaceState({}, '', url);
        
        // Always auto-load since we can use cache
        loadAllRepositories(initialRepos);
    }
});

/**
 * Load all repositories and display them grouped by type
 */
async function loadAllRepositories(repos, openOnly = true) {
    const loadingEl = document.getElementById('loading');
    const swimlanesEl = document.getElementById('swimlanes');
    const errorContainer = document.getElementById('error-container');

    // Clear previous data
    swimlanesEl.innerHTML = '';
    errorContainer.innerHTML = '';
    loadingEl.style.display = 'block';

    try {
        // Fetch all repositories
        const results = await Promise.all(
            repos.map(repo => fetchRepositoryData(repo, openOnly))
        );

        loadingEl.style.display = 'none';

        // Show errors for failed repositories
        const failed = results.filter(r => !r.success);
        if (failed.length > 0) {
            const errorMessages = failed.map(r => `${r.repo}: ${r.error}`).join('<br>');
            showError(`Failed to load some repositories:<br>${errorMessages}`);
        }

        // Display successful repositories
        const successful = results.filter(r => r.success);
        if (successful.length === 0) {
            swimlanesEl.innerHTML = '<div class="empty-state">No repositories loaded successfully</div>';
            return;
        }

        // Aggregate all issues by type (excluding PRs)
        const allIssues = successful.flatMap(r => r.issues);
        
        // Group by type
        const byType = {
            bug: allIssues.filter(item => item.type === 'bug'),
            feature: allIssues.filter(item => item.type === 'feature'),
            task: allIssues.filter(item => item.type === 'task'),
            other: allIssues.filter(item => item.type === 'other')
        };

        // Render swimlanes for each type
        const typeOrder = [
            { key: 'bug', label: '🐛 Bugs', icon: '🐛' },
            { key: 'feature', label: '✨ Features', icon: '✨' },
            { key: 'task', label: '📋 Tasks', icon: '📋' },
            { key: 'other', label: '❓ Other', icon: '❓' }
        ];

        typeOrder.forEach(({ key, label, icon }) => {
            if (byType[key].length > 0) {
                renderTypeSwimlane(label, byType[key]);
            }
        });

        if (allIssues.length === 0) {
            swimlanesEl.innerHTML = '<div class="empty-state">No issues found</div>';
        }

    } catch (error) {
        loadingEl.style.display = 'none';
        showError(`Error loading repositories: ${error.message}`);
    }
}

/**
 * Render a swimlane for a type
 */
function renderTypeSwimlane(typeLabel, items) {
    const swimlanesEl = document.getElementById('swimlanes');

    const swimlane = document.createElement('div');
    swimlane.className = 'swimlane collapsed';

    // Count repositories
    const repos = [...new Set(items.map(item => item.repoName))];

    swimlane.innerHTML = `
        <div class="swimlane-header">
            <div class="swimlane-title">
                <div class="swimlane-title-main">
                    <span class="collapse-icon">▼</span>
                    <span>${typeLabel}</span>
                </div>
            </div>
            <div class="swimlane-stats">
                <span>Issues: ${items.length}</span>
                <span>📂 Repos: ${repos.length}</span>
            </div>
        </div>
        <div class="swimlane-content">
            ${renderItems(items)}
        </div>
    `;

    // Add click handler for collapsing
    const header = swimlane.querySelector('.swimlane-header');
    header.addEventListener('click', () => {
        swimlane.classList.toggle('collapsed');
    });

    swimlanesEl.appendChild(swimlane);
}

/**
 * Render a list of items
 */
function renderItems(items) {
    if (items.length === 0) {
        return '<div class="empty-state">No items found</div>';
    }

    return items.map(item => {
        const stateIcon = item.state === 'open' ? '🟢' : '🔴';
        const milestone = item.milestone ? `<span class="milestone">🎯 ${escapeHtml(item.milestone.title)}</span>` : '';
        const createdDate = formatDate(item.created_at);
        const updatedDate = formatDate(item.updated_at);
        
        return `
            <div class="item" data-issue='${JSON.stringify(item).replace(/'/g, "&apos;")}'>
                <div class="item-header">
                    <span class="item-title-text" style="cursor: pointer;">
                        ${escapeHtml(item.title)}
                    </span>
                    <a href="${item.html_url}" class="item-title" target="_blank" rel="noopener noreferrer" style="margin-left: 8px; font-size: 14px;" onclick="event.stopPropagation();">↗️</a>
                    <span class="item-number">#${item.number}</span>
                </div>
                <div class="item-meta">
                    <span class="label repo-badge">${escapeHtml(item.repoName)}</span>
                    <span class="item-state">${stateIcon} ${item.state}</span>
                    <span class="item-dates">📅 ${createdDate} • 🔄 ${updatedDate}</span>
                    ${milestone}
                    ${item.labels.slice(0, 3).map(label => {
                        const labelName = typeof label === 'string' ? label : label.name;
                        const labelColor = typeof label === 'object' && label.color ? 
                            `#${label.color}` : '#6e7681';
                        const textColor = getContrastColor(labelColor);
                        return `<span class="label" style="background: ${labelColor}; color: ${textColor}">${escapeHtml(labelName)}</span>`;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Load and display issue details
 */
function loadIssueDetails(issue, iframeTitle, detailsContent) {
    renderIssueDetails(issue, issue.html_url, iframeTitle, detailsContent);
}
