// ==================== MOBILE MENU ==================== 
const menuToggle = document.getElementById('menuToggle');
const mobileMenu = document.getElementById('mobileMenu');
const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');

if (menuToggle) {
    menuToggle.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
        mobileMenuOverlay.classList.toggle('active');
        document.body.style.overflow = mobileMenu.classList.contains('active') ? 'hidden' : 'auto';
    });
}

function closeMobileMenu() {
    mobileMenu.classList.remove('active');
    mobileMenuOverlay.classList.remove('active');
    document.body.style.overflow = 'auto';
}

// Close mobile menu when clicking on a link
const mobileMenuLinks = document.querySelectorAll('.mobile-menu-link');
mobileMenuLinks.forEach(link => {
    link.addEventListener('click', () => {
        closeMobileMenu();
    });
});

// Close mobile menu when pressing Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu.classList.contains('active')) {
        closeMobileMenu();
    }
});

// ==================== FAQ TOGGLE ==================== 
function toggleFAQ(button) {
    const faqItem = button.parentElement;
    const isActive = faqItem.classList.contains('active');
    
    // Close all other FAQ items
    document.querySelectorAll('.faq-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Toggle current item
    if (!isActive) {
        faqItem.classList.add('active');
    }
}

// ==================== SMOOTH SCROLL ==================== 
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    });
});

// ==================== SCROLL ANIMATIONS ==================== 
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Observe feature cards, pricing cards, steps, and testimonials
document.querySelectorAll('.feature-card, .pricing-card, .step, .testimonial-card, .stat-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(el);
});

// ==================== NAVBAR SCROLL EFFECT ==================== 
let lastScrollTop = 0;
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    
    if (scrollTop > 100) {
        navbar.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
    } else {
        navbar.style.boxShadow = 'none';
    }
    
    lastScrollTop = scrollTop;
});

// ==================== ACTIVE NAV LINK ==================== 
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
    let current = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        
        if (pageYOffset >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
            link.classList.add('active');
        }
    });
});

// ==================== PARALLAX EFFECT ==================== 
const heroVisual = document.querySelector('.hero-visual');

if (heroVisual) {
    window.addEventListener('scroll', () => {
        const scrollPosition = window.pageYOffset;
        const heroSection = document.querySelector('.hero');
        const heroTop = heroSection.offsetTop;
        const heroHeight = heroSection.clientHeight;
        
        if (scrollPosition < heroTop + heroHeight) {
            const offset = (scrollPosition - heroTop) * 0.5;
            heroVisual.style.transform = `translateY(${offset}px)`;
        }
    });
}

// ==================== COUNTER ANIMATION ==================== 
const stats = document.querySelectorAll('.stat-number');
let hasAnimated = false;

const animateCounters = () => {
    if (hasAnimated) return;
    
    stats.forEach(stat => {
        const text = stat.textContent;
        const number = parseInt(text.replace(/\D/g, ''));
        const suffix = text.replace(/\d/g, '');
        
        let current = 0;
        const increment = Math.ceil(number / 50);
        
        const counter = setInterval(() => {
            current += increment;
            if (current >= number) {
                current = number;
                clearInterval(counter);
            }
            stat.textContent = current.toLocaleString() + suffix;
        }, 30);
    });
    
    hasAnimated = true;
};

// Trigger counter animation when stats are visible
const statsObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            animateCounters();
            statsObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.5 });

const heroStats = document.querySelector('.hero-stats');
if (heroStats) {
    statsObserver.observe(heroStats);
}

// ==================== BUTTON RIPPLE EFFECT ==================== 
const buttons = document.querySelectorAll('.btn, .card-btn');

buttons.forEach(button => {
    button.addEventListener('click', function(e) {
        const ripple = document.createElement('span');
        const rect = this.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        ripple.classList.add('ripple');
        
        this.appendChild(ripple);
        
        setTimeout(() => ripple.remove(), 600);
    });
});

// ==================== FORM VALIDATION ==================== 
const forms = document.querySelectorAll('form');

forms.forEach(form => {
    form.addEventListener('submit', function(e) {
        const inputs = this.querySelectorAll('input[required]');
        let isValid = true;
        
        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.style.borderColor = '#ea4335';
            } else {
                input.style.borderColor = '';
            }
        });
        
        if (!isValid) {
            e.preventDefault();
        }
    });
});

// ==================== ACCESSIBILITY ==================== 
// Add keyboard navigation support
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        mobileMenu.classList.remove('active');
    }
});

// ==================== PERFORMANCE ==================== 
// Lazy load images
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.add('loaded');
                observer.unobserve(img);
            }
        });
    });
    
    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// ==================== ANALYTICS ==================== 
// Track button clicks
document.querySelectorAll('.btn, .nav-link').forEach(element => {
    element.addEventListener('click', () => {
        if (window.gtag) {
            gtag('event', 'click', {
                'event_category': 'engagement',
                'event_label': element.textContent
            });
        }
    });
});

console.log('Home page loaded successfully');

// ==================== AUTH POPUPS ==================== 
function openLoginPopup(e) {
    e.preventDefault();
    document.getElementById('loginPopup').classList.add('active');
    document.getElementById('authPopupOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function openRegisterPopup(e) {
    e.preventDefault();
    document.getElementById('registerPopup').classList.add('active');
    document.getElementById('authPopupOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeLoginPopup() {
    document.getElementById('loginPopup').classList.remove('active');
    checkAndCloseOverlay();
}

function closeRegisterPopup() {
    document.getElementById('registerPopup').classList.remove('active');
    checkAndCloseOverlay();
}

function closeAllPopups() {
    document.getElementById('loginPopup').classList.remove('active');
    document.getElementById('registerPopup').classList.remove('active');
    document.getElementById('authPopupOverlay').classList.remove('active');
    document.body.style.overflow = 'auto';
}

function checkAndCloseOverlay() {
    const loginActive = document.getElementById('loginPopup').classList.contains('active');
    const registerActive = document.getElementById('registerPopup').classList.contains('active');
    
    if (!loginActive && !registerActive) {
        document.getElementById('authPopupOverlay').classList.remove('active');
        document.body.style.overflow = 'auto';
    }
}

function switchToLogin(e) {
    e.preventDefault();
    document.getElementById('registerPopup').classList.remove('active');
    document.getElementById('loginPopup').classList.add('active');
}

function switchToRegister(e) {
    e.preventDefault();
    document.getElementById('loginPopup').classList.remove('active');
    document.getElementById('registerPopup').classList.add('active');
}

// ==================== AUTH FORM HANDLERS ==================== 
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('loginRemember').checked;
    const errorDiv = document.getElementById('loginError');
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                password: password,
                remember: remember
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            window.location.href = '/app';
        } else {
            errorDiv.textContent = data.error || 'Đăng nhập thất bại';
            errorDiv.classList.add('show');
        }
    } catch (error) {
        errorDiv.textContent = 'Lỗi kết nối. Vui lòng thử lại.';
        errorDiv.classList.add('show');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirm = document.getElementById('registerConfirm').value;
    const errorDiv = document.getElementById('registerError');
    
    if (password !== confirm) {
        errorDiv.textContent = 'Mật khẩu không khớp';
        errorDiv.classList.add('show');
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                username: username,
                email: email,
                password: password
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            window.location.href = '/app';
        } else {
            errorDiv.textContent = data.error || 'Đăng ký thất bại';
            errorDiv.classList.add('show');
        }
    } catch (error) {
        errorDiv.textContent = 'Lỗi kết nối. Vui lòng thử lại.';
        errorDiv.classList.add('show');
    }
}

// Close popup when pressing Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeAllPopups();
    }
});

// ==================== HERO SHOWCASE ROTATION ==================== 
let currentShowcaseIndex = 0;
const showcaseItems = document.querySelectorAll('.showcase-item');

function rotateShowcase() {
    showcaseItems.forEach((item, index) => {
        item.classList.remove('active');
        if (index === currentShowcaseIndex) {
            item.classList.add('active');
        }
    });
    
    currentShowcaseIndex = (currentShowcaseIndex + 1) % showcaseItems.length;
}

// Auto-rotate every 4 seconds
if (showcaseItems.length > 0) {
    setInterval(rotateShowcase, 4000);
}

// ==================== TESTIMONIALS AUTO-SCROLL ==================== 
const testimonialsGrid = document.querySelector('.testimonials-grid');

if (testimonialsGrid && window.innerWidth <= 768) {
    let scrollPosition = 0;
    
    function autoScrollTestimonials() {
        const cardWidth = testimonialsGrid.querySelector('.testimonial-card')?.offsetWidth || 0;
        const gap = 16;
        
        if (cardWidth > 0) {
            scrollPosition += cardWidth + gap;
            
            // Reset to beginning if reached end
            if (scrollPosition > testimonialsGrid.scrollWidth - testimonialsGrid.clientWidth) {
                scrollPosition = 0;
            }
            
            testimonialsGrid.scrollTo({
                left: scrollPosition,
                behavior: 'smooth'
            });
        }
    }
    
    // Auto-scroll every 5 seconds on mobile
    setInterval(autoScrollTestimonials, 5000);
}

// ==================== TESTIMONIALS CAROUSEL ==================== 
let currentTestimonialIndex = 0;
const testimonialItems = document.querySelectorAll('.carousel-item');

function rotateTestimonials() {
    testimonialItems.forEach((item, index) => {
        item.classList.remove('active');
        if (index === currentTestimonialIndex) {
            item.classList.add('active');
        }
    });
    
    currentTestimonialIndex = (currentTestimonialIndex + 1) % testimonialItems.length;
}

// Auto-rotate every 5 seconds
if (testimonialItems.length > 0) {
    testimonialItems[0].classList.add('active');
    setInterval(rotateTestimonials, 5000);
}
