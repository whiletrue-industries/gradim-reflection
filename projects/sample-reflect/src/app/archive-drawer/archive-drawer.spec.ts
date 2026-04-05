import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ArchiveDrawer } from './archive-drawer';

describe('ArchiveDrawer', () => {
  let component: ArchiveDrawer;
  let fixture: ComponentFixture<ArchiveDrawer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArchiveDrawer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ArchiveDrawer);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
