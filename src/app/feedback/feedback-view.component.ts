import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { CouchService } from '../shared/couchdb.service';
import { UserService } from '../shared/user.service';
import { findDocuments } from '../shared/mangoQueries';
import { HttpRequest } from '@angular/common/http';
import { PlanetMessageService } from '../shared/planet-message.service';
import { DialogsFormService } from '../shared/dialogs/dialogs-form.service';
import { debug } from '../debug-operator';
import { FeedbackService as PouchFeedbackService } from '../shared/database';
@Component({
  templateUrl: './feedback-view.component.html',
  styleUrls: [ './feedback-view.scss' ]
})
export class FeedbackViewComponent implements OnInit, OnDestroy {
  readonly dbName = 'feedback';
  private onDestroy$ = new Subject<void>();
  feedback: any = {};
  user: any = {};
  newMessage = '';
  isActive = true;
  editTitleMode = false;
  @ViewChild('chatList') chatListElement: ElementRef;

  constructor(
    private couchService: CouchService,
    private userService: UserService,
    private route: ActivatedRoute,
    private dialogsFormService: DialogsFormService,
    private planetMessageService: PlanetMessageService,
    private pouchFeedbackService: PouchFeedbackService,
  ) {}

  ngOnInit() {
    this.route.paramMap.pipe(switchMap((params: ParamMap) => this.pouchFeedbackService.getFeedback(params.get('id'))))
      .pipe(debug('Getting feedback'), takeUntil(this.onDestroy$))
      .subscribe((result) => {
        this.feedback = result;
        this.feedback.messages = this.feedback.messages.sort((a, b) => a.time - b.time);
        this.scrollToBottom();
        this.setCouchListener(result._id);
      }, error => console.log(error));
    this.user = this.userService.get();
  }

  ngOnDestroy() {
    this.isActive = false;
    this.onDestroy$.next();
    this.onDestroy$.complete();
  }

  setFeedback(result) {
    this.feedback = result.docs[0];
    this.feedback.messages = this.feedback.messages.sort((a, b) => a.time - b.time);
    this.scrollToBottom();
  }

  getFeedback(id) {
    return this.couchService.post(this.dbName + '/_find', findDocuments({ '_id': id }));
  }

  postMessage() {
    let reopen = {};
    if (this.feedback.status === 'Closed') {
      reopen = { status: 'Reopened', closeTime: '' };
    }
    const newFeedback = Object.assign({}, this.feedback, reopen);
    // Object.assign is a shallow copy, so also copy messages array so view only updates after success
    newFeedback.messages = [].concat(this.feedback.messages, { message: this.newMessage, user: this.user.name, time: Date.now() });
    this.couchService.put(this.dbName + '/' + this.feedback._id, newFeedback)
      .pipe(switchMap((res) => {
        this.newMessage = '';
        return this.getFeedback(res.id);
      }))
      .subscribe(this.setFeedback.bind(this), error => this.planetMessageService.showAlert('There was an error adding your message'));
  }

  editTitle(mode) {
    this.editTitleMode = mode;
  }

  setTitle() {
    this.couchService.put(this.dbName + '/' + this.feedback._id, this.feedback).subscribe(
      () => {
        this.editTitleMode = false;
      },
      error => this.planetMessageService.showAlert('There was an error changing title')
    );
  }

  setCouchListener(id) {
    this.couchService.stream('GET', this.dbName + '/_changes?feed=continuous&since=now')
      .pipe(
        takeUntil(this.onDestroy$),
        switchMap(() => {
          return this.getFeedback(id);
        })
      )
      .subscribe(this.setFeedback.bind(this), error => console.log(error), () => {
        // Feed times out after one minute, so resubscribe until ngOnDestrpy runs.
        if (this.isActive) {
          this.setCouchListener(id);
        }
      });
  }

  scrollToBottom() {
    this.chatListElement.nativeElement.scrollTo({ top: this.chatListElement.nativeElement.scrollHeight, behavior: 'smooth' });
  }

  feedbackTrackByFn(index, item) {
    return item._id;
  }

}
