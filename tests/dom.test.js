import { jest } from '@jest/globals';
import { ActiveElementsByID, ActiveElementsByData, ScrollDown, ready } from '../src/index.js';

describe('DOM utilities', () => {
    // Setup a mock DOM
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="item1" class="item"></div>
            <div id="item2" class="item"></div>
            <div id="item3" data-type="special" class="item"></div>
            <div id="item4" data-type="normal" class="item"></div>
        `;
    });

    describe('ActiveElementsByID', () => {
        test('should add active class to correct element by ID', () => {
            const elements = document.querySelectorAll('.item');
            ActiveElementsByID(elements, 'item2');

            expect(elements[0].classList.contains('active')).toBe(false);
            expect(elements[1].classList.contains('active')).toBe(true);
            expect(elements[2].classList.contains('active')).toBe(false);
            expect(elements[3].classList.contains('active')).toBe(false);
        });
    });

    describe('ActiveElementsByData', () => {
        test('should add active class to element with matching data attribute', () => {
            const elements = document.querySelectorAll('.item');
            ActiveElementsByData(elements, 'type', 'special');

            expect(elements[0].classList.contains('active')).toBe(false);
            expect(elements[1].classList.contains('active')).toBe(false);
            expect(elements[2].classList.contains('active')).toBe(true);
            expect(elements[3].classList.contains('active')).toBe(false);
        });
    });

    describe('ScrollDown', () => {
        test('should scroll element to bottom', () => {
            const element = {
                scrollHeight: 1000,
                scrollTo: jest.fn()
            };

            ScrollDown(element);

            expect(element.scrollTo).toHaveBeenCalledWith({
                top: 1000,
                left: 0,
                behavior: 'smooth'
            });
        });
    });

    describe('ready', () => {
        test('should resolve when document is ready', async () => {
            const callback = jest.fn();
            await ready(callback);
            expect(callback).toHaveBeenCalled();
        });
    });
});
